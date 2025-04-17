// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const loginScreen = document.getElementById('login-screen');
const signupScreen = document.getElementById('signup-screen');
const aadhaarVerification = document.getElementById('aadhaar-verification');

const getStartedBtn = document.getElementById('get-started-btn');
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

// Event Listeners
getStartedBtn.addEventListener('click', () => {
    showScreen(signupScreen);
});

loginSplashBtn.addEventListener('click', () => {
    showScreen(loginScreen);
});

backToSplashBtn.addEventListener('click', () => {
    showScreen(splashScreen);
});

signupLink.addEventListener('click', () => {
    showScreen(signupScreen);
});

backToLoginBtn.addEventListener('click', () => {
    showScreen(loginScreen);
});

signupContinueBtn.addEventListener('click', () => {
    showScreen(aadhaarVerification);
});

aadhaarContinueBtn.addEventListener('click', () => {
    showScreen(aadhaarVerification);
});

backFromAadhaarBtn.addEventListener('click', () => {
    showScreen(signupScreen);
});

sendOtpBtn.addEventListener('click', () => {
    aadhaarStep1.style.display = 'none';
    aadhaarStep2.style.display = 'block';
});

// verifyOtpBtn.addEventListener('click', () => {
//     aadhaarStep2.style.display = 'none';
//     aadhaarStep3.style.display = 'block';
// });
verifyOtpBtn.addEventListener('click', () => {
    aadhaarStep2.style.display = 'none';
    aadhaarLoader.style.display = 'block';

    setTimeout(() => {
        aadhaarLoader.style.display = 'none';
        aadhaarStep3.style.display = 'block';
    }, 2000); // 2000ms = 2 seconds delay for loader
});

proceedToDashboardBtn.addEventListener('click', () => {
    alert('Redirecting to dashboard...');
    // Replace with actual navigation logic
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

        if (selected === 'phone') phoneLogin.style.display = 'block';
        if (selected === 'email') emailLogin.style.display = 'block';
        if (selected === 'aadhaar') aadhaarLogin.style.display = 'block';
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
// When user submits Aadhaar and goes to OTP
document.querySelector("#sendOtpBtn").addEventListener("click", function () {
    document.getElementById("aadhaarStep1").style.display = "none";
    document.getElementById("aadhaarStep2").style.display = "block";
    goToStep("step-otp");
});

// When user verifies OTP and moves to final step
document.querySelector("#verifyOtpBtn").addEventListener("click", function () {
    document.getElementById("aadhaarStep2").style.display = "none";
    document.getElementById("aadhaarLoader").style.display = "block";

    goToStep("step-verify");

    setTimeout(() => {
        document.getElementById("aadhaarLoader").style.display = "none";
        document.getElementById("aadhaarStep3").style.display = "block";
    }, 2000);
});
loginSplashBtn.addEventListener('click', () => {
    console.log("Login button clicked");  // Debugging log
    showScreen(loginScreen);
    loginOptions.forEach(option => {
        if (option.getAttribute('data-option') === 'password') {
            option.classList.add('active');
            passwordLogin.style.display = 'block';  // Show the password login section
        } else {
            option.classList.remove('active');
            phoneLogin.style.display = 'none';
            emailLogin.style.display = 'none';
            aadhaarLogin.style.display = 'none';
        }
    });
});
