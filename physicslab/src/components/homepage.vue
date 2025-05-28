<template>
  <div class="parentbox">
    <div class="mapbox">
      <div id="map" class="map"></div>
      <input
        type="text"
        id="map-search"
        placeholder="Search for a location"
        v-model="location"
      />
      <div v-if="suggestions.length > 0" class="suggestions-container">
        <div
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          @click="selectSuggestion(suggestion)"
          class="suggestion-item"
        >
          {{ suggestion.place_name }}
        </div>
      </div>
    </div>

    <div class="chatbox">
      <div class="sidebar">
        <h3>Selected Locations</h3>
        <ul v-if="selectedLocations.length > 0">
          <li v-for="loc in selectedLocations" :key="loc.id">
            <strong>{{ loc.name }}</strong><br />
            [{{ loc.coordinates.lat.toFixed(4) }}, {{ loc.coordinates.lng.toFixed(4) }}]
            <button @click="removeLocation(loc.id)">Remove</button>
          </li>
        </ul>
        <p v-else>No locations selected</p>
        <p v-if="totalDistance > 0">
          <strong>Total Distance:</strong> {{ totalDistance.toFixed(2) }} km
        </p>
        <button @click="clearAllLocations" v-if="selectedLocations.length > 0">Clear All</button>
      </div>
    </div>
  </div>
</template>

<script>
import mapboxgl from 'mapbox-gl';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default {
  name: 'HomePage',
  data() {
    return {
      location: '',
      suggestions: [],
      debounceTimer: null,
      map: null,
      selectedLocations: [],
      totalDistance: 0,
      nextLocationId: 0,
      maxMarkers: 5,
    };
  },
  watch: {
    location: {
      handler: 'fetchLocationSuggestions',
      immediate: false,
    },
    selectedLocations: {
      handler: 'calculateTotalDistance',
      deep: true,
    },
  },
  mounted() {
    mapboxgl.accessToken = 'pk.eyJ1IjoiY3VjdXJseXoiLCJhIjoiY21hMGx2ZjQ0MjZqNjJpcG1xNnhuZzN5eiJ9.9YAJFV1B_U8tY6bNL_aj9Q';
    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [123.8854, 10.3173],
      zoom: 15,
    });

    this.map.on('click', this.handleMapClick);
  },
  methods: {
    async fetchLocationSuggestions() {
      clearTimeout(this.debounceTimer);

      if (!this.location || this.location.trim().length < 3) {
        this.suggestions = [];
        return;
      }

      this.debounceTimer = setTimeout(async () => {
        const encoded = encodeURIComponent(this.location);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxgl.accessToken}&autocomplete=true&proximity=123.8854,10.3157`;

        try {
          const res = await fetch(url);
          const data = await res.json();
          this.suggestions = data.features.slice(0, 5) || [];
        } catch (error) {
          console.error('Fetch error:', error);
          this.suggestions = [];
        }
      }, 300);
    },

    selectSuggestion(suggestion) {
      if (this.selectedLocations.length >= this.maxMarkers) {
        this.showMessage('Maximum of 5 locations allowed.');
        return;
      }

      const [lng, lat] = suggestion.center;
      this.map.flyTo({ center: [lng, lat], zoom: 15 });

      const marker = new mapboxgl.Marker().setLngLat([lng, lat]).addTo(this.map);

      this.selectedLocations.push({
        id: this.nextLocationId++,
        name: suggestion.place_name,
        coordinates: { lat, lng },
        markerInstance: marker,
      });

      this.location = '';
      this.suggestions = [];
    },

    handleMapClick(e) {
      if (this.selectedLocations.length >= this.maxMarkers) {
        this.showMessage('Maximum of 5 locations allowed.');
        return;
      }

      const { lng, lat } = e.lngLat;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          const placeName =
            data.features.length > 0
              ? data.features[0].place_name
              : `Unnamed Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

          const marker = new mapboxgl.Marker().setLngLat([lng, lat]).addTo(this.map);

          this.selectedLocations.push({
            id: this.nextLocationId++,
            name: placeName,
            coordinates: { lat, lng },
            markerInstance: marker,
          });
        })
        .catch(err => {
          console.error(err);
        });
    },

    removeLocation(id) {
      const idx = this.selectedLocations.findIndex(loc => loc.id === id);
      if (idx !== -1) {
        this.selectedLocations[idx].markerInstance.remove();
        this.selectedLocations.splice(idx, 1);
      }
    },

    clearAllLocations() {
      this.selectedLocations.forEach(loc => loc.markerInstance.remove());
      this.selectedLocations = [];
      this.totalDistance = 0;
    },

    calculateTotalDistance() {
      this.totalDistance = 0;
      for (let i = 0; i < this.selectedLocations.length - 1; i++) {
        const a = this.selectedLocations[i].coordinates;
        const b = this.selectedLocations[i + 1].coordinates;
        this.totalDistance += haversineDistance(a.lat, a.lng, b.lat, b.lng);
      }
    },

    showMessage(msg) {
      console.warn('Message:', msg);
    },
  },
};
</script>

<style scoped>
#map {
  width: 100%;
  height: 100%;
  border-radius: 20px;
  overflow: hidden;
}

</style>
