// Create this as a new file: public/map.js

document.addEventListener('DOMContentLoaded', function() {
  // Initialize the map
  const map = L.map('map-container').setView([0, 0], 2); // Default view of the world
  
  // Add the tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  
  // Custom intensity colors for markers
  function getIntensityColor(intensity) {
    // Convert intensity (0-100) to a color
    const hue = (100 - intensity) * 1.2; // 120 is green, 0 is red
    return `hsl(${hue}, 100%, 50%)`;
  }
  
  // Function to create a custom marker based on intensity
  function createMarker(lat, lng, intensity, title) {
    const markerColor = getIntensityColor(intensity);
    
    // Create a circular marker with a size proportional to intensity
    const size = 10 + (intensity / 10); // Base size + adjustment for intensity
    
    return L.circleMarker([lat, lng], {
      radius: size,
      fillColor: markerColor,
      color: '#000',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).bindPopup(`<strong>${title}</strong><br>Intensity: ${intensity}`);
  }
  
  // Function to load posts from the API
  function loadPosts(userLat, userLng) {
    // Show loading indicator
    map.spin(true);
    
    // Fetch posts from the API with coordinates
    const apiUrl = `/api/posts?lat=${userLat}&lng=${userLng}&radius=10000`;
    
    fetch(apiUrl)
      .then(response => response.json())
      .then(posts => {
        // Clear existing markers
        map.eachLayer(layer => {
          if (layer instanceof L.CircleMarker) {
            map.removeLayer(layer);
          }
        });
        
        // Add markers for each post
        posts.forEach(post => {
          const { location, intensity, title } = post;
          const [lng, lat] = location.coordinates;
          
          const marker = createMarker(lat, lng, intensity, title);
          marker.addTo(map);
        });
        
        // Hide loading indicator
        map.spin(false);
      })
      .catch(error => {
        console.error('Error loading posts:', error);
        map.spin(false);
      });
  }
  
  // Function to get user's location and center the map
  function getUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          
          // Center map on user location
          map.setView([latitude, longitude], 13);
          
          // Add marker for user's location
          L.marker([latitude, longitude])
            .addTo(map)
            .bindPopup('Your location')
            .openPopup();
          
          // Load posts near the user
          loadPosts(latitude, longitude);
        },
        error => {
          console.error('Error getting location:', error);
          // If location access is denied, just load all posts
          loadPosts(null, null);
        }
      );
    } else {
      console.error('Geolocation not supported');
      loadPosts(null, null);
    }
  }
  
  // Add a loading spinner to the map (optional Leaflet.Spin plugin)
  // If you don't have the plugin, you can use a simple loading indicator
  if (!map.spin) {
    map.spin = function(spin) {
      const loadingEl = document.getElementById('map-loading');
      if (!loadingEl) {
        const mapContainer = document.getElementById('map-container');
        const loading = document.createElement('div');
        loading.id = 'map-loading';
        loading.innerHTML = 'Loading...';
        loading.style.position = 'absolute';
        loading.style.top = '50%';
        loading.style.left = '50%';
        loading.style.transform = 'translate(-50%, -50%)';
        loading.style.background = 'rgba(255,255,255,0.8)';
        loading.style.padding = '10px';
        loading.style.borderRadius = '5px';
        loading.style.display = 'none';
        mapContainer.appendChild(loading);
      }
      
      document.getElementById('map-loading').style.display = spin ? 'block' : 'none';
    };
  }
  
  // Initialize the map with user location
  getUserLocation();
  
  // Set up refresh button
  document.getElementById('refresh-map').addEventListener('click', getUserLocation);
});