// Add this to a new file: public/location-handler.js

document.addEventListener('DOMContentLoaded', function() {
  // Only run on pages with the new post form
  const newPostForm = document.getElementById('newPostForm');
  if (!newPostForm) return;
  
  // Create a small map for location selection
  const locationMap = L.map('location-map').setView([0, 0], 2);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(locationMap);
  
  // Selected location marker
  let locationMarker = null;
  
  // Function to update form fields with selected location
  function updateLocationFields(lat, lng, address) {
    document.getElementById('post-lat').value = lat;
    document.getElementById('post-lng').value = lng;
    document.getElementById('post-address').value = address;
    
    // Show the selected location
    document.getElementById('selected-location').textContent = address || `Lat: ${lat}, Lng: ${lng}`;
    document.getElementById('location-display').style.display = 'block';
    
    // Update or create marker
    if (locationMarker) {
      locationMarker.setLatLng([lat, lng]);
    } else {
      locationMarker = L.marker([lat, lng]).addTo(locationMap);
    }
    
    // Center map on selected location
    locationMap.setView([lat, lng], 15);
  }
  
  // Function to get address from coordinates using Nominatim
  function getAddressFromCoordinates(lat, lng) {
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .then(response => response.json())
      .then(data => data.display_name || 'Unknown location')
      .catch(() => 'Unknown location');
  }
  
  // Handle map clicks to select location
  locationMap.on('click', async function(e) {
    const { lat, lng } = e.latlng;
    const address = await getAddressFromCoordinates(lat, lng);
    updateLocationFields(lat, lng, address);
  });
  
  // Get user's current location
  document.getElementById('use-current-location').addEventListener('click', function() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async function(position) {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const address = await getAddressFromCoordinates(lat, lng);
          updateLocationFields(lat, lng, address);
        },
        function(error) {
          console.error('Error getting location:', error);
          alert('Could not get your location. Please select it on the map.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser. Please select your location on the map.');
    }
  });
  
  // Search for location
  const searchInput = document.getElementById('location-search');
  const searchButton = document.getElementById('search-location');
  
  searchButton.addEventListener('click', searchLocation);
  
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchLocation();
    }
  });
  
  function searchLocation() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    // Use Nominatim for geocoding
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      .then(response => response.json())
      .then(data => {
        if (data && data.length > 0) {
          const result = data[0];
          updateLocationFields(result.lat, result.lon, result.display_name);
        } else {
          alert('Location not found. Please try a different search term.');
        }
      })
      .catch(error => {
        console.error('Error searching location:', error);
        alert('Error searching for location. Please try again.');
      });
  }
  
  // Form validation - prevent submission without location
  newPostForm.addEventListener('submit', function(e) {
    const lat = document.getElementById('post-lat').value;
    const lng = document.getElementById('post-lng').value;
    
    if (!lat || !lng) {
      e.preventDefault();
      alert('Please select a location for your post.');
      document.getElementById('location-section').scrollIntoView();
    }
  });
});