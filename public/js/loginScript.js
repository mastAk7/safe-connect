// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const loginScreen = document.getElementById('login-screen');
const signupScreen = document.getElementById('signup-screen');
const aadhaarVerification = document.getElementById('aadhaar-verification');

const loginSplashBtn = document.getElementById('login-splash-btn');
const backToSplashBtn = document.getElementById('back-to-splash-btn');
const signupLink = document.getElementById('signup-link');
const backToLoginBtn = document.getElementById('back-to-login-btn');
const emergencyBtn = document.getElementById('emergency-btn');

const loginOptions = document.querySelectorAll('.login-option');
const phoneLogin = document.getElementById('phone-login');
const emailLogin = document.getElementById('email-login');
const aadhaarLogin = document.getElementById('aadhaar-login');

const aadhaarContinueBtn = document.getElementById('aadhaar-continue-btn');
const backFromAadhaarBtn = document.getElementById('back-from-aadhaar-btn');

const signupContinueBtn = document.getElementById('signup-continue-btn');
const sendOtpBtn = document.getElementById('send-otp-btn');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const proceedToDashboardBtn = document.getElementById('proceed-to-dashboard-btn');

const aadhaarStep1 = document.getElementById('aadhaar-step-1');
const aadhaarStep2 = document.getElementById('aadhaar-step-2');
const aadhaarStep3 = document.getElementById('aadhaar-step-3');
const aadhaarLoader = document.getElementById('aadhaar-loader');

const verificationSteps = document.querySelectorAll('.step');
const otpInputs = document.querySelectorAll('.otp-input');

// Helper Function to switch screens
function showScreen(screen) {
    splashScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    signupScreen.style.display = 'none';
    aadhaarVerification.style.display = 'none';

    screen.style.display = 'block';
}


aadhaarContinueBtn.addEventListener('click', () => {
    showScreen(aadhaarVerification);
});



// Login option switching
loginOptions.forEach(option => {
    option.addEventListener('click', () => {
        loginOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');

        const selected = option.getAttribute('data-option');
        phoneLogin.style.display = 'none';
        emailLogin.style.display = 'none';
        aadhaarLogin.style.display = 'none';

        if (selected === 'phone'){ 
            phoneLogin.style.display = 'block';
            alert("Enter number: +919999999999, OTP: 123456")
        }
        if (selected === 'email') emailLogin.style.display = 'block';
        if (selected === 'aadhaar') alert("email authentication access not granted")
    });
});
function goToStep(stepClass) {
    // Remove active from all steps
    document.querySelectorAll('.verification-steps .step').forEach(step => {
      step.classList.remove('active');
    });
  
    // Add active to the current step
    const currentStep = document.querySelector(`.verification-steps .${stepClass}`);
    if (currentStep) currentStep.classList.add('active');
}

