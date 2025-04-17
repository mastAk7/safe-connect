// Add this function to emergency.js to improve location handling
function getUserLocation() {
  const locationAddressElement = document.querySelector('.location-address');
  
  if (navigator.geolocation) {
    if (locationAddressElement) {
      locationAddressElement.textContent = 'Getting your location...';
    }
    
    navigator.geolocation.getCurrentPosition(
      function(position) {
        const userLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        
        // Update the hidden fields
        const latField = document.getElementById('user-lat');
        const lngField = document.getElementById('user-lng');
        
        if (latField && lngField) {
          latField.value = userLocation.latitude;
          lngField.value = userLocation.longitude;
        }
        
        // Update location display
        if (locationAddressElement) {
          locationAddressElement.textContent = 'Getting your address...';
        }
        
        // Reverse geocode to get address
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.latitude}&lon=${userLocation.longitude}&zoom=18`)
          .then(response => response.json())
          .then(data => {
            if (locationAddressElement) {
              locationAddressElement.textContent = data.display_name || 'Your current location';
            }
          })
          .catch(error => {
            console.error('Error getting address:', error);
            if (locationAddressElement) {
              locationAddressElement.textContent = 'Location detected (address unavailable)';
            }
          });
      },
      function(error) {
        console.error('Error getting location:', error);
        if (locationAddressElement) {
          locationAddressElement.textContent = 'Location access denied';
        }
        alert('Unable to get your location. Please enable location services.');
      }
    );
  } else {
    if (locationAddressElement) {
      locationAddressElement.textContent = 'Geolocation not supported';
    }
    alert('Geolocation is not supported by your browser');
  }
}


document.addEventListener('DOMContentLoaded', function() {
  getUserLocation();
  
  // Add event listener to location confirm button
  const confirmLocationBtn = document.querySelector('.confirm-location');
  if (confirmLocationBtn) {
    confirmLocationBtn.addEventListener('click', getUserLocation);
  }
  // Countdown functionality
  let countdown = 10;
  const countdownElement = document.getElementById('countdown');
  const countdownContainer = document.querySelector('.countdown-container');
  const cancelBtn = document.getElementById('cancel-countdown');
  
  if (countdownContainer && countdownElement) {
    const countdownInterval = setInterval(() => {
      countdown--;
      countdownElement.textContent = countdown;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        countdownContainer.style.display = 'none';
        // Auto-submit the emergency alert
        submitEmergencyAlert();
      }
    }, 1000);
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        clearInterval(countdownInterval);
        countdownContainer.style.display = 'none';
      });
    }
  }
  
  // Emergency type selection
  const emergencyTypes = document.querySelectorAll('.emergency-type');
  
  emergencyTypes.forEach(type => {
    type.addEventListener('click', () => {
      emergencyTypes.forEach(t => t.classList.remove('selected'));
      type.classList.add('selected');
    });
  });
  
  // Submit emergency alert
  function submitEmergencyAlert() {
    // Get user location from hidden fields
    const latitude = document.getElementById('user-lat').value;
    const longitude = document.getElementById('user-lng').value;
    
    if (!latitude || !longitude) {
      alert('Still trying to get your location. Please wait a moment.');
      getUserLocation();
      return;
    }
    
    // Get selected emergency type
    const selectedType = document.querySelector('.emergency-type.selected');
    if (!selectedType) {
      alert('Please select an emergency type');
      return;
    }
    
    const emergencyType = selectedType.id.replace('type-', '');
    const description = document.querySelector('.description-input').value;
    const severity = document.getElementById('severity-slider').value;
    const isAnonymous = document.querySelector('.toggle-switch input').checked;
    
    // Show loading state
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) {
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
    }
    
    // Send alert to server
    fetch('/api/sos/alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        emergencyType,
        description,
        severity,
        isAnonymous
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Reload the page to show the status section
        window.location.reload();
      } else {
        if (submitBtn) {
          submitBtn.textContent = 'Send Alert';
          submitBtn.disabled = false;
        }
        alert('Failed to send emergency alert: ' + (data.message || 'Please try again.'));
      }
    })
    .catch(error => {
      console.error('Error sending alert:', error);
      if (submitBtn) {
        submitBtn.textContent = 'Send Alert';
        submitBtn.disabled = false;
      }
      alert('Network error. Please try again.');
    });
  }
  
  // Add event listener to the submit button
  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitEmergencyAlert);
  }
});