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
        <p v-if="resultantVector > 0" style="margin-top: 12px;">
          <strong>Resultant Displacement:</strong> {{ resultantVector.toFixed(2) }} km
        </p>
        <!-- Removed segment angles from here -->
        <button @click="clearAllLocations" v-if="selectedLocations.length > 0">Clear All</button>

        <!-- Arrival time and speed calculation section -->
        <div class="arrival-time-box">
          <label for="arrival-mins"><strong>Desired Time to Arrive (minutes):</strong></label>
          <input
            type="text"
            id="arrival-mins"
            v-model="arrivalMinutes"
            class="arrival-time-input"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 30"
          />
          <button @click="showRequiredSpeed" :disabled="!totalDistance || !arrivalMinutes">Calculate Speed</button>
        </div>
      </div>
    </div>

    <!-- Modal for result (move here, outside chatbox/sidebar) -->
    <div v-if="showSpeedModal" class="modal-overlay">
      <div class="modal-content">
        <h3>Required Speed</h3>
        <p>
          To arrive in {{ arrivalMinutes }} minutes,<br>
          you need to travel from:<br>
          <strong>{{ selectedLocations[0].name }}</strong><br>
          to:<br>
          <strong>{{ selectedLocations[selectedLocations.length - 1].name }}</strong><br>
          at <strong>{{ requiredSpeed.toFixed(2) }} km/h</strong>.
        </p>
        
        <div v-if="vectorAngles.length > 0" style="margin-top: 16px;">
          <h4>Segment Angles</h4>
          <ul style="text-align:left;">
            <li v-for="(angle, idx) in vectorAngles" :key="idx">
              <strong>Segment {{ idx + 1 }} Angle:</strong>
              {{ angle.toFixed(2) }}°
              ({{ angleToDirection(angle) }})
            </li>
          </ul>
        </div>
        <button @click="showSpeedModal = false">Close</button>
      </div>
    </div>
  </div>
  <div class="up-logo-container">
    <img src="/src/assets/uplogo2.png" alt="UP Logo" class="up-logo-top-left" />
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
      lineLayerId: 'route-line',

      // New data properties for arrival time feature
      arrivalMinutes: 0,
      requiredSpeed: 0,
      showSpeedModal: false,

      // Added properties for vector and angle calculations
      resultantVector: 0,
      vectorAngles: [],
    };
  },
  watch: {
    location: {
      handler: 'fetchLocationSuggestions',
      immediate: false,
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
    this.map.on('load', () => {
      this.map.addSource(this.lineLayerId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });
      this.map.addLayer({
        id: this.lineLayerId,
        type: 'line',
        source: this.lineLayerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ff0000',
          'line-width': 3,
        },
      });
      // Add resultant vector source/layer
      this.map.addSource('resultant-vector', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });
      this.map.addLayer({
        id: 'resultant-vector-layer',
        type: 'line',
        source: 'resultant-vector',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#00ff00', // green
          'line-width': 4,
          'line-dasharray': [2, 2], // dashed line
        },
      });
    });
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
    updateMapLineAndKinematics() {
            this.totalDistance = 0;
            const lineCoordinates = []; // This array will hold the [lng, lat] pairs for the line

            if (this.selectedLocations.length >= 2) {
                // Calculate total distance (as before)
                for (let i = 0; i < this.selectedLocations.length - 1; i++) {
                    const p1 = this.selectedLocations[i].coordinates;
                    const p2 = this.selectedLocations[i + 1].coordinates;
                    this.totalDistance += haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
                }
                // Prepare coordinates for the line (Mapbox expects [lng, lat] pairs)
                this.selectedLocations.forEach(loc => {
                    lineCoordinates.push([loc.coordinates.lng, loc.coordinates.lat]);
                });
            } else {
                // If less than 2 locations, ensure line is empty
                this.totalDistance = 0;
            }

            // Update the Mapbox line source with the new coordinates
            if (this.map.getSource('route')) {
                this.map.getSource('route').setData({
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: lineCoordinates // This updates the line on the map
                    }
                });
            }
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
      this.calculateTotalDistance();
      this.drawLineBetweenMarkers();
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
          this.calculateTotalDistance();
          this.drawLineBetweenMarkers();
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
        this.calculateTotalDistance();
        this.drawLineBetweenMarkers();
      }
    },

    clearAllLocations() {
      this.selectedLocations.forEach(loc => loc.markerInstance.remove());
      this.selectedLocations = [];
      this.totalDistance = 0;
      this.drawLineBetweenMarkers();
    },
    drawLineBetweenMarkers() {
  if (!this.map || !this.map.getSource(this.lineLayerId)) return;
  const coords = this.selectedLocations.map(loc => [loc.coordinates.lng, loc.coordinates.lat]);
  this.map.getSource(this.lineLayerId).setData({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  });

  // Draw resultant vector as a dashed line from first to last location
  if (
    this.selectedLocations.length >= 2 &&
    this.map.getSource('resultant-vector')
  ) {
    const first = this.selectedLocations[0].coordinates;
    const last = this.selectedLocations[this.selectedLocations.length - 1].coordinates;
    this.map.getSource('resultant-vector').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [first.lng, first.lat],
          [last.lng, last.lat],
        ],
      },
    });
  } else if (this.map.getSource('resultant-vector')) {
    // Clear resultant vector if not enough points
    this.map.getSource('resultant-vector').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [],
      },
    });
  }
},
    calculateTotalDistance() {
  this.totalDistance = 0;
  this.resultantVector = 0;
  this.vectorAngles = [];

  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < this.selectedLocations.length - 1; i++) {
    const a = this.selectedLocations[i].coordinates;
    const b = this.selectedLocations[i + 1].coordinates;

    // Calculate distance (haversine)
    const dist = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    this.totalDistance += dist;

    // Calculate vector components (approximate, assuming small distances)
    const dx = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * 111.32; // km per degree longitude
    const dy = (b.lat - a.lat) * 110.574; // km per degree latitude

    sumX += dx;
    sumY += dy;

    // Calculate angle in degrees (relative to east, counterclockwise)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    this.vectorAngles.push(angle);
  }

  // Resultant vector magnitude
  this.resultantVector = Math.sqrt(sumX * sumX + sumY * sumY);
},

    showMessage(msg) {
      console.warn('Message:', msg);
    },

    showRequiredSpeed() {
      if (this.totalDistance > 0 && this.arrivalMinutes > 0) {
        const speed = this.totalDistance / (this.arrivalMinutes / 60);
        this.requiredSpeed = speed;
        this.showSpeedModal = true;
      } else {
        this.showMessage('Please ensure total distance and arrival time are set.');
      }
    },
  },
};
</script>

<style scoped>

</style>
