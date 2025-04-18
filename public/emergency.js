// DOM Elements
const cancelCountdownBtn = document.getElementById('cancel-countdown');
const countdownEl = document.getElementById('countdown');
const safeNowBtn = document.querySelector('.safe-now-btn');
const emergencyTypes = document.querySelectorAll('.emergency-type');
const userAddressEl = document.getElementById('user-address');
const userLatInput = document.getElementById('user-lat');
const userLngInput = document.getElementById('user-lng');
const submitBtn = document.querySelector('.submit-btn');
const descriptionInput = document.querySelector('.description-input');
const severitySlider = document.getElementById('severity-slider');
const anonymousToggle = document.querySelector('.toggle-switch input');
const countdownContainer = document.querySelector('.countdown-container');

// Global variables
let selectedEmergencyType = null;
let countdownInterval = null;
let countdownSeconds = 10;
let locationObtained = false;
let initialized = false; // Track initialization state

// Initialize
function init() {
  // Prevent double initialization
  if (initialized) {
    console.log('Already initialized, skipping');
    return;
  }
  
  console.log('Initializing emergency system...');
  
  // Check if on SOS page by looking for key elements
  const isSOSPage = countdownEl || submitBtn || userAddressEl;
  
  if (!isSOSPage) {
    console.log('Not on SOS page, skipping initialization');
    return;
  }
  
  console.log('Setting up event listeners');
  setupEventListeners();
  
  console.log('Getting user location');
  getUserLocation();
  
  // Only start countdown if element exists and we're showing countdown
  // Also check that no countdown is already running
  if (countdownEl && countdownContainer && 
      !countdownContainer.style.display?.includes('none') && 
      !countdownInterval) {
    console.log('Starting countdown');
    startCountdown();
  } else {
    console.log('Countdown not started: element missing, container hidden, or countdown already running');
  }
  
  // Mark as initialized
  initialized = true;
}

// Event listeners - Ensure we're not adding duplicate event listeners
function setupEventListeners() {
  // Type selection
  if (emergencyTypes && emergencyTypes.length) {
    console.log(`Setting up ${emergencyTypes.length} emergency type listeners`);
    
    // Store references to the cloned elements
    const clonedTypes = [];
    
    emergencyTypes.forEach(type => {
      // Remove any existing event listeners first
      const typeClone = type.cloneNode(true);
      clonedTypes.push(typeClone);
      
      if (type.parentNode) {
        type.parentNode.replaceChild(typeClone, type);
      }
      
      // Add fresh event listener
      typeClone.addEventListener('click', () => {
        // Remove selected class from all types
        clonedTypes.forEach(t => t.classList.remove('selected'));
        // Add selected class to selected type
        typeClone.classList.add('selected');
        // Store selected type
        selectedEmergencyType = typeClone.id.replace('type-', '');
        console.log(`Selected emergency type: ${selectedEmergencyType}`);
      });
    });
  } else {
    console.warn('No emergency type elements found');
  }

  // Cancel countdown
  if (cancelCountdownBtn) {
    console.log('Setting up cancel countdown button');
    // Clone and replace to remove old event listeners
    const cancelBtnClone = cancelCountdownBtn.cloneNode(true);
    if (cancelCountdownBtn.parentNode) {
      cancelCountdownBtn.parentNode.replaceChild(cancelBtnClone, cancelCountdownBtn);
    }
    
    cancelBtnClone.addEventListener('click', () => {
      clearInterval(countdownInterval);
      countdownInterval = null; // Reset interval variable
      if (countdownContainer) {
        countdownContainer.style.display = 'none';
      }
      console.log('Countdown cancelled');
    });
  } else {
    console.warn('Cancel countdown button not found');
  }

  // Submit button
  if (submitBtn) {
    console.log('Setting up submit button');
    // Clone and replace to remove old event listeners
    const submitBtnClone = submitBtn.cloneNode(true);
    if (submitBtn.parentNode) {
      submitBtn.parentNode.replaceChild(submitBtnClone, submitBtn);
    }
    
    submitBtnClone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent event bubbling
      // Prevent double submissions
      if (submitBtnClone.disabled) return;
      
      submitBtnClone.disabled = true;
      sendEmergencyAlert();
      // Re-enable after timeout as a safety measure
      setTimeout(() => {
        submitBtnClone.disabled = false;
      }, 3000);
    });
  } else {
    console.warn('Submit button not found');
  }

  // Safe now button
  if (safeNowBtn) {
    console.log('Setting up safe now button');
    // Clone and replace to remove old event listeners
    const safeNowBtnClone = safeNowBtn.cloneNode(true);
    if (safeNowBtn.parentNode) {
      safeNowBtn.parentNode.replaceChild(safeNowBtnClone, safeNowBtn);
    }
    
    safeNowBtnClone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent event bubbling
      // Prevent double clicks
      if (safeNowBtnClone.disabled) return;
      
      safeNowBtnClone.disabled = true;
      markUserAsSafe(e);
      // Re-enable after timeout as a safety measure
      setTimeout(() => {
        safeNowBtnClone.disabled = false;
      }, 3000);
    });
  }
}

// Start countdown timer
function startCountdown() {
  if (!countdownEl) {
    console.warn('Countdown element not found, cannot start countdown');
    return;
  }
  
  // Clear any existing interval first
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Reset countdown to starting value
  countdownSeconds = 10;
  countdownEl.textContent = countdownSeconds;
  
  console.log('Starting countdown from', countdownSeconds);
  
  countdownInterval = setInterval(() => {
    countdownSeconds--;
    
    if (countdownEl) {
      countdownEl.textContent = countdownSeconds;
    }
    
    if (countdownSeconds <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null; // Reset interval variable
      console.log('Countdown finished, auto-sending alert');
      // Auto-send alert when countdown reaches zero
      sendEmergencyAlert();
    }
  }, 1000);
}

// Mark user as safe and cancel the alert
function markUserAsSafe(event) {
  // Use the event parameter, or fallback to global event if not provided
  const evt = event || window.event;
  // Find the button that was clicked
  const button = evt.target.closest('.safe-now-btn');
  
  if (!button) {
    console.error('Could not find safe now button element');
    return;
  }
  
  const alertId = button.getAttribute('data-alert-id');
  
  if (!alertId) {
    console.error('No alert ID found in safe now button');
    alert('Error: Could not identify the emergency alert');
    return;
  }
  
  console.log(`Marking user as safe for alert ID: ${alertId}`);
  
  // Disable button to prevent multiple clicks
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Processing...';
  
  fetch('/api/sos/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ alertId })
  })
  .then(response => {
    console.log('Server response status:', response.status);
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Cancel alert response:', data);
    
    if (data.success) {
      // Show success message and redirect
      alert('You have been marked as safe. Emergency alert cancelled.');
      
      // Use timeout to let alert close before redirect
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } else {
      console.error('Server reported failure:', data.message);
      alert('Failed to cancel alert: ' + (data.message || 'Please try again.'));
      
      // Re-enable button
      button.disabled = false;
      button.textContent = originalText;
    }
  })
  .catch(error => {
    console.error('Error cancelling alert:', error);
    alert('Failed to cancel alert. Please try again.');
    
    // Re-enable button
    button.disabled = false;
    button.textContent = originalText;
  });
}

// Get user's location
function getUserLocation() {
  console.log('Getting user location...');
  
  // Check if geolocation is supported
  if (!navigator.geolocation) {
    console.error('Geolocation is not supported by this browser');
    alert('Your browser does not support location services. Please use a different browser.');
    return;
  }
  
  // Show loading state or notification
  if (userAddressEl) {
    userAddressEl.textContent = 'Getting your location...';
  }
  
  // Get current position
  navigator.geolocation.getCurrentPosition(
    // Success callback
    function(position) {
      const { latitude, longitude } = position.coords;
      console.log(`Location obtained: ${latitude}, ${longitude}`);
      
      // Store location in hidden inputs for form submission
      if (userLatInput) userLatInput.value = latitude;
      if (userLngInput) userLngInput.value = longitude;
      
      // Update location status flag
      locationObtained = true;
      
      // Show the address or coordinates
      if (userAddressEl) {
        // Try to reverse geocode to get human-readable address
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(response => response.json())
          .then(data => {
            if (userAddressEl) {
              userAddressEl.textContent = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            }
          })
          .catch(error => {
            console.error('Error getting address:', error);
            if (userAddressEl) {
              userAddressEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            }
          });
      }
      
      // Try to update map preview if available
      try {
        const mapPreview = document.querySelector('.map-preview img');
        if (mapPreview) {
          // Update map image with coordinates (using placeholder as fallback)
          const mapUrl = `/api/map/static?lat=${latitude}&lng=${longitude}&zoom=15&width=400&height=150`;
          mapPreview.src = mapUrl;
          mapPreview.onerror = () => {
            mapPreview.src = '/api/placeholder/400/150';
          };
        }
      } catch (mapError) {
        console.error('Error updating map preview:', mapError);
      }
    },
    // Error callback
    function(error) {
      console.error('Error getting location:', error);
      
      let errorMessage;
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please enable location services for this site.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out.';
          break;
        default:
          errorMessage = 'An unknown error occurred getting your location.';
      }
      
      if (userAddressEl) {
        userAddressEl.textContent = errorMessage;
      }
      
      alert(errorMessage);
    },
    // Options
    { 
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

// Send emergency alert
function sendEmergencyAlert() {
  console.log('Sending emergency alert...');
  
  // Check if we have the required information
  if (!locationObtained) {
    console.error('Cannot send alert: Location not obtained');
    alert('Unable to determine your location. Please try again or enter your address manually.');
    return;
  }
  
  if (!selectedEmergencyType) {
    console.error('Cannot send alert: No emergency type selected');
    alert('Please select an emergency type before submitting.');
    return;
  }
  
  // Get values from form elements
  const latitude = userLatInput ? userLatInput.value : null;
  const longitude = userLngInput ? userLngInput.value : null;
  const description = descriptionInput ? descriptionInput.value : '';
  const severity = severitySlider ? severitySlider.value : 3;
  const isAnonymous = anonymousToggle ? anonymousToggle.checked : false;
  
  // Validate coordinates
  if (!latitude || !longitude || isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
    console.error('Invalid coordinates:', { latitude, longitude });
    alert('Invalid location data. Please refresh and try again.');
    return;
  }
  
  console.log('Sending alert with data:', {
    latitude, longitude, emergencyType: selectedEmergencyType,
    description, severity, isAnonymous
  });
  
  // Find the submit button in the current DOM (it might have been replaced)
  const currentSubmitBtn = document.querySelector('.submit-btn');
  
  // Disable submit button to prevent multiple submissions
  if (currentSubmitBtn) {
    currentSubmitBtn.disabled = true;
    currentSubmitBtn.textContent = 'Sending...';
  }
  
  // Send data to server
  fetch('/api/sos/alert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      emergencyType: selectedEmergencyType,
      description,
      severity: parseInt(severity, 10),
      isAnonymous
    })
  })
  .then(response => {
    console.log('Server response status:', response.status);
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Alert sent successfully:', data);
    
    if (data.success) {
      // Hide countdown if it's showing
      if (countdownContainer) {
        countdownContainer.style.display = 'none';
      }
      
      // Show success message with number of notified volunteers
      const volunteersText = data.volunteers > 0 
        ? `Alert sent to ${data.volunteers} nearby volunteers!` 
        : 'Alert sent! Looking for volunteers in your area.';
      
      alert(`Emergency services have been notified. ${volunteersText}`);
      
      // Redirect to status page or refresh
      window.location.href = `/sos?alertId=${data.alertId}`;
    } else {
      console.error('Server reported failure:', data.message);
      alert('Failed to send alert: ' + (data.message || 'Please try again.'));
      
      // Re-enable submit button
      const updatedSubmitBtn = document.querySelector('.submit-btn');
      if (updatedSubmitBtn) {
        updatedSubmitBtn.disabled = false;
        updatedSubmitBtn.textContent = 'Send Alert';
      }
    }
  })
  .catch(error => {
    console.error('Error sending alert:', error);
    alert('Failed to send alert. Please try again or call emergency services directly.');
    
    // Re-enable submit button
    const updatedSubmitBtn = document.querySelector('.submit-btn');
    if (updatedSubmitBtn) {
      updatedSubmitBtn.disabled = false;
      updatedSubmitBtn.textContent = 'Send Alert';
    }
  });
}

// Cleanup function when navigating away
function cleanup() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  initialized = false;
}

// Add listener for page visibility changes
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    cleanup();
  } else if (document.visibilityState === 'visible' && !initialized) {
    // Re-initialize if coming back to the page and not initialized
    init();
  }
});

// DOM loaded event listener - only init once
let domInitialized = false;
document.addEventListener('DOMContentLoaded', function() {
  if (!domInitialized) {
    console.log('DOM loaded, initializing emergency system');
    init();
    domInitialized = true;
  }
});

// Only call init directly if DOM is already loaded
if (document.readyState === 'complete' && !initialized) {
  console.log('Document already loaded, initializing immediately');
  init();
}

// Add event listener for beforeunload to clean up
window.addEventListener('beforeunload', cleanup);