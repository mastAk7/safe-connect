// Initialize map variables
let map, marker;
const defaultPosition = [40.7128, -74.0060]; // Default to NYC

document.addEventListener('DOMContentLoaded', function() {
  // Only initialize map if we're on the create/edit post page
  if (document.getElementById('location-map')) {
    initializeMap();
    setupLocationControls();
  }
});

function initializeMap() {
  // Create map centered on default position
  map = L.map('location-map').setView(defaultPosition, 13);
  
  // Add tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  
  // Add initial marker
  marker = L.marker(defaultPosition, { draggable: true }).addTo(map);
  
  // When marker is dragged, update coordinates
  marker.on('dragend', function() {
    const position = marker.getLatLng();
    updateCoordinateFields(position.lat, position.lng);
    reverseGeocode(position.lat, position.lng);
  });
  
  // When map is clicked, move marker and update coordinates
  map.on('click', function(e) {
    marker.setLatLng(e.latlng);
    updateCoordinateFields(e.latlng.lat, e.latlng.lng);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
  });
  
  // Try to get user's current location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Move map and marker to user's location
        map.setView([lat, lng], 15);
        marker.setLatLng([lat, lng]);
        
        // Update form fields
        updateCoordinateFields(lat, lng);
        reverseGeocode(lat, lng);
      },
      function(error) {
        console.error("Error getting location:", error);
      }
    );
  }
}

function setupLocationControls() {
  // Current location button
  document.getElementById('use-current-location').addEventListener('click', function() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(position) {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          // Move map and marker
          map.setView([lat, lng], 15);
          marker.setLatLng([lat, lng]);
          
          // Update form fields
          updateCoordinateFields(lat, lng);
          reverseGeocode(lat, lng);
        },
        function(error) {
          alert("Error getting your location: " + error.message);
        }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  });
  
  // Location search
  document.getElementById('search-location').addEventListener('click', function() {
    const searchText = document.getElementById('location-search').value;
    if (searchText) {
      geocodeAddress(searchText);
    }
  });
  
  // Also allow pressing Enter to search
  document.getElementById('location-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('search-location').click();
    }
  });
}

function updateCoordinateFields(lat, lng) {
  document.getElementById('post-lat').value = lat;
  document.getElementById('post-lng').value = lng;
  
  // Show coordinates in the UI
  document.getElementById('location-display').style.display = 'block';
  document.getElementById('selected-location').textContent = `Latitude: ${lat.toFixed(6)}, Longitude: ${lng.toFixed(6)}`;
}

function reverseGeocode(lat, lng) {
  // Use Nominatim for reverse geocoding
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
    .then(response => response.json())
    .then(data => {
      if (data.display_name) {
        document.getElementById('post-address').value = data.display_name;
        document.getElementById('selected-location').textContent = data.display_name;
      }
    })
    .catch(error => {
      console.error("Error reverse geocoding:", error);
    });
}

function geocodeAddress(address) {
  // Use Nominatim for forward geocoding
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
    .then(response => response.json())
    .then(data => {
      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        
        // Move map and marker
        map.setView([lat, lng], 15);
        marker.setLatLng([lat, lng]);
        
        // Update form fields
        updateCoordinateFields(lat, lng);
        document.getElementById('post-address').value = result.display_name;
        document.getElementById('selected-location').textContent = result.display_name;
      } else {
        alert("Location not found. Please try a different search term.");
      }
    })
    .catch(error => {
      console.error("Error geocoding address:", error);
      alert("Error searching for location. Please try again.");
    });
}