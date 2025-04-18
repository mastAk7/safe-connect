document.addEventListener('DOMContentLoaded', function() {
  console.log('Map initialization started');
  
  // Initialize the map
  const map = L.map('map-container').setView([0, 0], 2); // Default view of the world
  console.log('Map created');
  
  // Add the tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  console.log('Tile layer added');
  
  // Custom intensity colors for markers
  function getIntensityColor(intensity) {
    // Convert intensity (0-100) to a color
    const hue = (100 - intensity) * 1.2; // 120 is green, 0 is red
    return `hsl(${hue}, 100%, 50%)`;
  }
  
  // Function to create a custom marker based on intensity
  function createMarker(lat, lng, intensity, title) {
    console.log(`Creating marker at [${lat}, ${lng}] with intensity ${intensity}`);
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
  
  // Function to display a debug message on the map
  function showDebugMessage(message, isError = false) {
    console.log(isError ? `ERROR: ${message}` : `INFO: ${message}`);
    
    const debugDiv = document.createElement('div');
    debugDiv.className = 'map-debug-message';
    debugDiv.innerHTML = message;
    debugDiv.style.position = 'absolute';
    debugDiv.style.bottom = '10px';
    debugDiv.style.left = '10px';
    debugDiv.style.backgroundColor = isError ? 'rgba(255,0,0,0.7)' : 'rgba(0,0,255,0.7)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.zIndex = '1000';
    debugDiv.style.maxWidth = '80%';
    
    document.getElementById('map-container').appendChild(debugDiv);
    setTimeout(() => {
      if (debugDiv.parentNode) {
        debugDiv.parentNode.removeChild(debugDiv);
      }
    }, 5000);
  }
  
  // Function to load all posts regardless of location
  function loadAllPosts() {
    showDebugMessage("Loading all posts (no location filtering)");
    
    fetch('/api/posts')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(posts => {
        showDebugMessage(`Received ${posts.length} posts from API`);
        displayPosts(posts);
      })
      .catch(error => {
        showDebugMessage(`Failed to load posts: ${error.message}`, true);
        map.spin(false);
      });
  }
  
  // Function to display posts on the map
  function displayPosts(posts) {
    // Clear existing markers
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });
    
    if (!posts || posts.length === 0) {
      showDebugMessage("No posts received from API", true);
      map.spin(false);
      return;
    }
    
    showDebugMessage(`Processing ${posts.length} posts`);
    
    // Create bounds for fitting map
    const bounds = L.latLngBounds();
    let validPostCount = 0;
    
    // Add markers for each post
    posts.forEach(post => {
      try {
        if (!post.location || !post.location.coordinates) {
          console.warn('Post missing coordinates:', post);
          return;
        }
        
        const [lng, lat] = post.location.coordinates;
        
        // Make sure values are valid numbers
        if (isNaN(lat) || isNaN(lng)) {
          console.warn(`Invalid coordinates [${lng}, ${lat}] for post: ${post.title}`);
          return;
        }
        
        const marker = createMarker(lat, lng, post.intensity, post.title);
        marker.addTo(map);
        bounds.extend([lat, lng]);
        validPostCount++;
      } catch (e) {
        console.error('Error processing post:', e, post);
      }
    });
    
    showDebugMessage(`Added ${validPostCount} markers to the map`);
    
    // Fit bounds if we have valid posts
    if (validPostCount > 0 && bounds.isValid()) {
      map.fitBounds(bounds);
      showDebugMessage('Map adjusted to show all posts');
    }
    
    map.spin(false);
  }
  
  // Function to load posts from the API
  function loadPosts(userLat, userLng) {
    // Show loading indicator
    map.spin(true);
    
    // If we don't have coordinates, load all posts
    if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
      return loadAllPosts();
    }
    
    showDebugMessage(`Loading posts near [${userLat}, ${userLng}]`);
    
    // Build the API URL with user coordinates
    const apiUrl = `/api/posts?lat=${userLat}&lng=${userLng}&radius=10000`;
    
    // Fetch posts from the API
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(posts => {
        showDebugMessage(`Received ${posts.length} posts from API`);
        displayPosts(posts);
      })
      .catch(error => {
        showDebugMessage(`Failed to load posts: ${error.message}`, true);
        map.spin(false);
      });
  }
  
  // Function to get user's location and center the map
  function getUserLocation() {
    // Show loading indicator while getting location
    map.spin(true);
    showDebugMessage('Requesting user location');
    
    if (navigator.geolocation) {
      // Add a timeout to ensure we don't wait forever
      const locationTimeout = setTimeout(() => {
        showDebugMessage('Location request timed out', true);
        loadAllPosts();
      }, 10000);
      
      navigator.geolocation.getCurrentPosition(
        position => {
          clearTimeout(locationTimeout);
          const { latitude, longitude } = position.coords;
          
          showDebugMessage(`Got user location [${latitude}, ${longitude}]`);
          
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
          clearTimeout(locationTimeout);
          showDebugMessage(`Location error: ${error.message}`, true);
          loadAllPosts();
        },
        { timeout: 10000, maximumAge: 60000 } // 10s timeout, cache for 1 minute
      );
    } else {
      showDebugMessage('Geolocation not supported by browser', true);
      loadAllPosts();
    }
  }
  
  // Add a loading spinner to the map
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
        loading.style.zIndex = '1000';
        mapContainer.appendChild(loading);
      }
      
      document.getElementById('map-loading').style.display = spin ? 'block' : 'none';
    };
  }
  
  // Add a button to directly load all posts
  function addEmergencyLoadButton() {
    const mapContainer = document.getElementById('map-container');
    const button = document.createElement('button');
    button.id = 'emergency-load-button';
    button.innerHTML = 'Load All Posts';
    button.style.position = 'absolute';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.zIndex = '1000';
    button.style.backgroundColor = '#fff';
    button.style.border = '2px solid rgba(0,0,0,0.2)';
    button.style.borderRadius = '4px';
    button.style.padding = '5px 10px';
    
    button.addEventListener('click', () => {
      loadAllPosts();
    });
    
    mapContainer.appendChild(button);
  }
  
  // Initialize the map with user location
  getUserLocation();
  
  // Add emergency button
  addEmergencyLoadButton();
  
  // Set up refresh button
  const refreshButton = document.getElementById('refresh-map');
  if (refreshButton) {
    refreshButton.addEventListener('click', getUserLocation);
  }
});