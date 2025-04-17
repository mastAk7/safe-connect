// Initialize the map
const map = L.map('volunteer-map').setView([20.5937, 78.9629], 5); // Default center of India

// Add the OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Store markers for emergency locations
const markers = {};

// Store current volunteer location
let volunteerMarker = null;
let volunteerPosition = null;

// Get volunteer's current location
function getCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        volunteerPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        // Update the map view to volunteer's location
        map.setView([volunteerPosition.lat, volunteerPosition.lng], 13);
        
        // Add or update volunteer marker
        if (volunteerMarker) {
          volunteerMarker.setLatLng([volunteerPosition.lat, volunteerPosition.lng]);
        } else {
          volunteerMarker = L.marker([volunteerPosition.lat, volunteerPosition.lng], {
            icon: L.divIcon({
              className: 'volunteer-marker',
              html: '🛟',
              iconSize: [30, 30]
            })
          }).addTo(map);
        }
        
        // Send volunteer location to server
        updateVolunteerLocation(volunteerPosition);
        
        // Add emergency markers
        addEmergencyMarkers();
      },
      error => {
        console.error('Error getting location:', error);
        alert('Unable to access your location. Please enable location services.');
      }
    );
  } else {
    alert('Geolocation is not supported by this browser.');
  }
}

// Send volunteer location to server
function updateVolunteerLocation(position) {
  fetch('/api/volunteer/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      latitude: position.lat,
      longitude: position.lng
    })
  })
  .then(response => response.json())
  .then(data => {
    if (!data.success) {
      console.error('Failed to update location');
    }
  })
  .catch(error => {
    console.error('Error updating location:', error);
  });
}

// Add markers for emergency alerts
function addEmergencyMarkers() {
  // Get all emergency alerts from the page
  const alertCards = document.querySelectorAll('.victim-card[data-id]');
  
  alertCards.forEach(card => {
    const alertId = card.getAttribute('data-id');
    
    // Fetch alert details including coordinates
    fetch(`/api/volunteer/alerts/${alertId}`)
      .then(response => response.json())
      .then(data => {
        if (data.alert && data.alert.location && data.alert.location.coordinates) {
          const [lng, lat] = data.alert.location.coordinates;
          
          // Create or update marker
          if (!markers[alertId]) {
            // Create marker with appropriate icon based on emergency type
            let iconHtml = '🚨';
            if (data.alert.emergencyType === 'medical') iconHtml = '🏥';
            if (data.alert.emergencyType === 'fire') iconHtml = '🔥';
            if (data.alert.emergencyType === 'criminal') iconHtml = '👮';
            if (data.alert.emergencyType === 'accident') iconHtml = '🚗';
            
            markers[alertId] = L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'emergency-marker',
                html: iconHtml,
                iconSize: [30, 30]
              })
            }).addTo(map);
            
            // Add a popup with alert details
            markers[alertId].bindPopup(`
              <strong>${data.alert.user ? data.alert.user.name : 'Unknown'}</strong><br>
              ${data.alert.emergencyType} emergency<br>
              <button onclick="respondToEmergency('${alertId}')" class="popup-respond-btn">Respond</button>
            `);
          } else {
            // Update existing marker position
            markers[alertId].setLatLng([lat, lng]);
          }
        }
      })
      .catch(error => {
        console.error('Error fetching alert details:', error);
      });
  });
}

// Handle emergency response
function respondToEmergency(alertId) {
  if (!confirm('Are you sure you want to respond to this emergency?')) {
    return;
  }
  
  fetch(`/api/volunteer/respond/${alertId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('You are now responding to this emergency. Please proceed to the location.');
      // Highlight the alert card
      const card = document.querySelector(`.victim-card[data-id="${alertId}"]`);
      if (card) {
        card.classList.add('responding');
        // Disable respond button
        const respondBtn = card.querySelector('.respond-btn');
        if (respondBtn) {
          respondBtn.disabled = true;
          respondBtn.textContent = '✓ Responding';
        }
      }
    } else {
      alert(data.message || 'Failed to respond to emergency');
    }
  })
  .catch(error => {
    console.error('Error responding to emergency:', error);
    alert('Error responding to emergency. Please try again.');
  });
}

// Placeholder for chat functionality
function startChat(alertId) {
  // In a real app, this would open a chat interface
  alert('Chat functionality would be implemented here');
}

// Call the victim
function startCall(alertId) {
  // Get the victim's phone number
  fetch(`/api/volunteer/alerts/${alertId}`)
    .then(response => response.json())
    .then(data => {
      if (data.alert && data.alert.user && data.alert.user.phone) {
        // Use the tel: protocol to initiate a call
        window.location.href = `tel:${data.alert.user.phone}`;
      } else {
        alert('Phone number not available');
      }
    })
    .catch(error => {
      console.error('Error fetching victim details:', error);
      alert('Could not retrieve phone number');
    });
}

// Open victim profile (placeholder)
function openVictimProfile(name, alertId) {
  // In a real app, this would open a detailed profile view
  alert(`Would show detailed profile for ${name}`);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  // Get current location on page load
  getCurrentLocation();
  
  // Set up periodic location updates (every 30 seconds)
  setInterval(getCurrentLocation, 30000);
});