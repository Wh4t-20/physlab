import { createRouter, createWebHistory } from 'vue-router'
import Homepage from './components/homepage.vue'

const routes = [
    {
        path: '/',
        name: 'HomePage',
        component: Homepage,
    }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router