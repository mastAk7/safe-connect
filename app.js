import express from "express"; 
import bodyParser from "body-parser";
import mongoose from 'mongoose';
import session from 'express-session';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import env from 'dotenv';
import admin from 'firebase-admin';
import cors from 'cors';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import multer from 'multer' 

const router = express.Router()

const app = express();  
const port = 3000;
env.config();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cors());
app.use(router);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Firebase Admin Initialization
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Database connection
mongoose.connect(process.env.DB_URL)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.log(err);
  });

// Updated User schema with phone field
const userSchema = new mongoose.Schema({
  phone: { type: String },
  email: { type: String },
  name: {type: String},
  secret: { type: String },
  role: { type: String, enum: ['user', 'volunteer'], default: 'user' },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    lastUpdated: { 
      type: Date,
      default: Date.now
    }
  },
  posts: [{ 
    id: Number,
    title: String,
    content: String,
    date: Date,
    image: {
        data: Buffer,
        contentType: String
    }
  }]
});

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String },
  date: { type: Date },
  intensity: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: {
      type: String,
      required: false
    }
  },
  image: {
    data: Buffer,
    contentType: String
  }
});

const emergencySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  emergencyType: {
    type: String,
    enum: ['medical', 'criminal', 'accident', 'fire'],
    required: true
  },
  description: String,
  severity: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  anonymous: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'responding', 'resolved', 'cancelled'],
    default: 'active'
  },
  notifiedVolunteers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  respondingVolunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

emergencySchema.index({ location: '2dsphere' });
postSchema.index({ location: '2dsphere' });
userSchema.index({ location: '2dsphere' });

const Emergency = mongoose.model(process.env.DB_COLLECTION_EMERGENCY, emergencySchema);
const User = mongoose.model(process.env.DB_COLLECTION_USER, userSchema);
const Post = mongoose.model(process.env.DB_COLLECTION_POST, postSchema);

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
}

// Volunteer middleware to check role
function isVolunteer(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'volunteer') {
    return next();
  }
  res.status(403).json({ message: 'Access denied. Volunteer status required.' });
}

const CALLBACK_URL = process.env.NODE_ENV === 'production' 
  ? 'https://safe-connect-n3d5.onrender.com/auth/google/secrets'
  : 'http://localhost:3000/auth/google/secrets';

// Google authentication strategy
passport.use(
  "google",
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  }, (accessToken, refreshToken, profile, cb) => {
    User.findOne({email : profile.emails[0].value}) 
      .then(user => {
        if(!user){
          const newUser = new User({
            email : profile.emails[0].value,
            password: "google",
            posts: []
          });
          console.log(newUser)

          newUser.save()
            .then(() => {
              cb(null, newUser);
            })
            .catch(err => {   
              cb(err);
            });
        } else{
          cb(null, user);
        }
      })
      .catch(err => {
        cb(err);
      });
  })
);

// Phone authentication strategy
passport.use('firebase-phone', new CustomStrategy(
  async (req, done) => {
    try {
      // Get the ID token passed from client
      const idToken = req.body.idToken;
      
      if (!idToken) {
        return done(null, false, { message: 'No ID token provided' });
      }
      
      // Verify the ID token with Firebase Admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const phoneNumber = decodedToken.phone_number;
      
      if (!phoneNumber) {
        return done(null, false, { message: 'No phone number in token' });
      }
      
      // Check if user exists
      let user = await User.findOne({ phone: phoneNumber });
      
      if (!user) {
        // Create new user if first time
        user = new User({
          phone: phoneNumber,
          password: "phone",
          posts: []
        });
        
        await user.save();
      }
      
      return done(null, user);
    } catch (error) {
      console.error('Error verifying phone auth:', error);
      return done(error);
    }
  }
));

// Google authentication endpoint
app.get('/auth/google', passport.authenticate("google", {
  scope: ["profile", "email"],
}));

app.get("/auth/google/secrets", passport.authenticate("google", {
  successRedirect: "/addDetails",
  failureRedirect: "/"
}));

// Phone verification endpoint
app.post("/auth/phone/verify", (req, res, next) => {
  passport.authenticate('firebase-phone', (err, user, info) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    
    if (!user) {
      return res.status(401).json({ success: false, message: info?.message || 'Authentication failed' });
    }
    
    // Log the user in
    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ success: false, message: loginErr.message });
      }
      
      return res.json({ 
        success: true, 
        user: { 
          phone: user.phone
        },
        redirect: '/addDetails'
      });
    });
  })(req, res, next);
});

// SOS routes
app.get("/sos", isAuthenticated, async (req, res) => {
  try {
    // Only allow normal users to access this page
    if (req.user.role === 'volunteer') {
      return res.redirect('/volunteer/sos');
    }
    
    // Check if user has an active alert
    const activeAlert = await Emergency.findOne({
      user: req.user._id,
      status: { $in: ['active', 'responding'] }
    }).populate('respondingVolunteer', 'name');
    
    let responderName = null;
    if (activeAlert && activeAlert.respondingVolunteer) {
      responderName = activeAlert.respondingVolunteer.name;
      activeAlert.responderName = responderName;
    }
    
    res.render("userSos.ejs", {
      user: req.user,
      activeAlert: activeAlert,
      showCountdown: !activeAlert // Only show countdown if no active alert
    });
  } catch (error) {
    console.error('Error rendering SOS page:', error);
    res.status(500).send("Server error");
  }
});


app.post("/api/sos/alert", isAuthenticated, async (req, res) => {
  try {
    console.log("SOS alert received:", req.body);
    
    const { latitude, longitude, emergencyType, description, severity, isAnonymous } = req.body;
    
    // Check if required fields are present
    if (!latitude || !longitude || !emergencyType) {
      console.log("Missing required fields:", { latitude, longitude, emergencyType });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    console.log("Updating user location for user:", req.user._id);
    
    // Update user's current location
    await User.findByIdAndUpdate(req.user._id, {
      'location.coordinates': [longitude, latitude],
      'location.lastUpdated': new Date()
    });
    
    console.log("Finding nearest volunteers");
    
    // Find nearest volunteers within 10km radius
    const nearestVolunteers = await User.find({
      role: 'volunteer',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: 10000 // 10km radius
        }
      }
    }).limit(5);
    
    console.log("Found volunteers:", nearestVolunteers.length);
    
    // Create an emergency alert record
    const alert = new Emergency({
      user: req.user._id,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      emergencyType,
      description,
      severity: severity || 3,
      anonymous: isAnonymous || false,
      status: 'active',
      notifiedVolunteers: nearestVolunteers.map(v => v._id)
    });
    
    console.log("Saving emergency alert");
    
    await alert.save();
    
    console.log("Alert saved successfully");
    
    res.json({
      success: true,
      message: 'Emergency alert sent to nearest volunteers',
      alertId: alert._id, // Send the alert ID back for cancellation
      volunteers: nearestVolunteers.length // Return actual number of volunteers
    });
  } catch (error) {
    console.error('SOS alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to send alert' });
  }
}); 
 

app.post("/api/sos/cancel", isAuthenticated, async (req, res) => {
  try {
    const { alertId } = req.body;
    
    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'Alert ID is required'
      });
    }
    
    // Find and update the active alert for this user
    const result = await Emergency.findOneAndUpdate(
      { _id: alertId, user: req.user._id, status: { $in: ['active', 'responding'] } },
      { status: 'cancelled' }
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Active alert not found'
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Emergency alert cancelled' 
    });
  } catch (error) {
    console.error('Error cancelling alert:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel alert' 
    });
  }
});


// nearby emergency alerts
app.get('/api/volunteer/alerts', isVolunteer, async (req, res) => {
  try {
    // Get volunteer's current location
    const volunteer = await User.findById(req.user._id);
    
    // Find active emergency alerts sorted by distance
    // Find active emergency alerts sorted by distance
const emergencyAlerts = await Emergency.aggregate([
  {
    $geoNear: {
      near: volunteer.location,
      distanceField: 'distance',
      spherical: true,
      distanceMultiplier: 0.001, // Convert to kilometers
      query: { status: 'active' } // Move the match criteria into geoNear's query parameter
    }
  },
  { $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'userDetails'
  }},
  { $unwind: '$userDetails' },
  { $limit: 10 }
]);
    
    // Process results to add address display
    const processedEmergencies = await Promise.all(emergencyAlerts.map(async (alert) => {
      const [lng, lat] = alert.location.coordinates;
      
      // Get address using Nominatim (in production, use a more robust geocoding service)
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        return {
          ...alert,
          user: {
            name: alert.userDetails.name,
            phone: alert.userDetails.phone
          },
          addressDisplay: data.display_name || 'Unknown location',
          distance: Math.round(alert.distance * 10) / 10 // Round to 1 decimal place
        };
      } catch (error) {
        return {
          ...alert,
          user: {
            name: alert.userDetails.name,
            phone: alert.userDetails.phone
          },
          addressDisplay: 'Location available on map',
          distance: Math.round(alert.distance * 10) / 10
        };
      }
    }));
    
    res.json({
      emergencyAlerts: processedEmergencies,
      pendingAlerts: [] // This would be for alerts that haven't escalated yet
    });
  } catch (error) {
    console.error('Error fetching volunteer alerts:', error);
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

// Volunteer SOS Dashboard
app.get("/volunteer/sos", isAuthenticated, async (req, res) => {
  try {
    // Redirect non-volunteers to the user SOS page
    if (req.user.role !== 'volunteer') {
      return res.redirect('/sos');
    }
    
    // Get volunteer's current location
    const volunteer = await User.findById(req.user._id);
    
    // Find active emergency alerts sorted by distance
    // Find active emergency alerts sorted by distance
const emergencyAlerts = await Emergency.aggregate([
  {
    $geoNear: {
      near: volunteer.location,
      distanceField: 'distance',
      spherical: true,
      distanceMultiplier: 0.001, // Convert to kilometers
      query: { status: 'active' } // Move the match criteria into geoNear's query parameter
    }
  },
  { $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'userDetails'
  }},
  { $unwind: '$userDetails' },
  { $limit: 10 }
]);
    
    // Process results to add address display
    const processedEmergencies = await Promise.all(emergencyAlerts.map(async (alert) => {
      const [lng, lat] = alert.location.coordinates;
      
      // Get address using Nominatim (in production, use a more robust geocoding service)
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        return {
          ...alert,
          user: {
            name: alert.userDetails.name,
            phone: alert.userDetails.phone
          },
          addressDisplay: data.display_name || 'Unknown location',
          distance: Math.round(alert.distance * 10) / 10 // Round to 1 decimal place
        };
      } catch (error) {
        return {
          ...alert,
          user: {
            name: alert.userDetails.name,
            phone: alert.userDetails.phone
          },
          addressDisplay: 'Location available on map',
          distance: Math.round(alert.distance * 10) / 10
        };
      }
    }));
    
    res.render("volunteerSos.ejs", {
      user: req.user,
      emergencyAlerts: processedEmergencies,
      pendingAlerts: [] // This would be for alerts that haven't escalated yet
    });
  } catch (error) {
    console.error('Error rendering volunteer SOS page:', error);
    res.status(500).send("Server error");
  }
});

// Mark volunteer as responding to emergency
app.post('/api/volunteer/respond/:alertId', isVolunteer, async (req, res) => {
  try {
    const alert = await Emergency.findById(req.params.alertId);
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    if (alert.status !== 'active') {
      return res.status(400).json({ 
        success: false,
        message: 'This alert is no longer active'
      });
    }
    
    // Update the alert with the responding volunteer
    alert.status = 'responding';
    alert.respondingVolunteer = req.user._id;
    await alert.save();
    
    // In a real app, you'd notify the user via push notification or websocket
    
    res.json({ 
      success: true,
      message: 'You are now responding to this emergency'
    });
  } catch (error) {
    console.error('Error responding to alert:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to respond to emergency'
    });
  }
});

// Add a route to become a volunteer
app.get("/become-volunteer", isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { role: 'volunteer' });
    res.redirect("/volunteer/sos");
  } catch (error) {
    res.status(500).send("Error becoming a volunteer");
  }
});

//when volunteer needs more information about a specific alert
app.get('/api/volunteer/alerts/:alertId', isVolunteer, async (req, res) => {
  try {
    const alert = await Emergency.findById(req.params.alertId)
      .populate('user', 'name phone');
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    res.json({ alert });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch alert details' });
  }
});

// Add this route to update volunteer location
app.post('/api/volunteer/location', isAuthenticated, isVolunteer, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      'location.coordinates': [longitude, latitude],
      'location.lastUpdated': new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating volunteer location:', error);
    res.status(500).json({ success: false });
  }
});

app.get("/loginOptions", (req,res) => {
  res.render("loginOptions.ejs");
})

// Authentication routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/indexFeed");
  } else {
    res.render("login.ejs");
  }
});

app.get("/phone-login", (req, res) => {
  res.render("phone-login.ejs");
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if(err) console.log(err);
    res.redirect('/');
  });
});

// Route to view a single post
app.get("/post/:id", isAuthenticated, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).render("error.ejs", { 
        message: "Post not found",
        user: req.user
      });
    }
    
    // Format the post data
    let imageBase64 = null;
    if (post.image && post.image.data) {
      imageBase64 = `data:${post.image.contentType};base64,${post.image.data.toString('base64')}`;
    }
    
    // Format date and time
    const postDate = post.date || new Date();
    const formattedDate = postDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    const formattedTime = postDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
    
    // Get author info
    const author = await User.findOne({ email: post.author });
    const authorName = author ? author.name : "Unknown User";
    const authorInitial = authorName ? authorName.charAt(0).toUpperCase() : "?";
    
    // Get comments (if you implement this feature)
    // const comments = await Comment.find({ postId: post._id }).sort({ createdAt: -1 });
    
    res.render("postDetail.ejs", {
      post: {
        ...post.toObject(),
        imageBase64,
        formattedDate,
        formattedTime,
        authorName,
        authorInitial
      },
      user: req.user,
      // comments: comments
    });
  } catch (err) {
    console.error("Error fetching post details:", err);
    res.status(500).render("error.ejs", { 
      message: "Error loading post",
      user: req.user
    });
  }
});

// Blog routes (protected by authentication)
// Modify the indexFeed route to include distance sorting
app.get("/indexFeed", isAuthenticated, async (req, res) => {
  try {
    // First get the current user's location
    const user = await User.findById(req.user._id);
    const userCoordinates = user.location.coordinates; // [longitude, latitude]
    
    // Function to calculate distance between two points using the Haversine formula
    function calculateDistance(lat1, lon1, lat2, lon2) {
      // Convert to radians
      const toRad = value => value * Math.PI / 180;
      
      const R = 6371; // Radius of the Earth in km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // Distance in km
      
      return distance;
    }

    function shortenAddress(address) {
      // [existing shortenAddress function]
    }
    
    // Get all posts
    const posts = await Post.find({});
    
    // Format posts and add distance info
    const formattedPosts = await Promise.all(posts.map(async post => {
      let imageBase64 = null;
      if (post.image && post.image.data) {
          imageBase64 = `data:${post.image.contentType};base64,${post.image.data.toString('base64')}`;
      }
      
      // Default values
      let distanceText = "Unknown distance";
      let locationAddress = "Unknown location";
      let distanceValue = Number.MAX_VALUE; // For sorting, default to maximum value
      
      // Validate coordinates - ensure neither set is 0,0 or invalid
      if (post.location && post.location.coordinates && 
          post.location.coordinates.length === 2 && 
          userCoordinates && userCoordinates.length === 2) {
          
          const [postLng, postLat] = post.location.coordinates;
          const [userLng, userLat] = userCoordinates;
          
          // Check for valid coordinates - all must be non-zero and valid numbers
          const hasValidPostCoords = postLat !== undefined && postLng !== undefined && 
                                  !isNaN(postLat) && !isNaN(postLng) && 
                                  !(Math.abs(postLat) < 0.000001 && Math.abs(postLng) < 0.000001);
                                  
          const hasValidUserCoords = userLat !== undefined && userLng !== undefined && 
                                  !isNaN(userLat) && !isNaN(userLng) && 
                                  !(Math.abs(userLat) < 0.000001 && Math.abs(userLng) < 0.000001);
          
          // Calculate distance only if all coordinates are valid
          if (hasValidPostCoords && hasValidUserCoords) {
              const distance = calculateDistance(postLat, postLng, userLat, userLng);
              
              // Ensure distance is valid
              if (!isNaN(distance) && distance >= 0) {
                  distanceValue = distance; // Store the raw distance value for sorting
                  const roundedDistance = Math.round(distance * 10) / 10; // Round to 1 decimal place
                  distanceText = `${roundedDistance} km away`;
              }
          }
          
          // Address handling
          if (post.location.address) {
              // Use stored address if available
              locationAddress = shortenAddress(post.location.address);
          } else if (hasValidPostCoords) {
              // Try to get address from coordinates if needed
              try {
                  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${postLat}&lon=${postLng}`);
                  
                  if (response.ok) {
                      const data = await response.json();
                      
                      // Extract and shorten address
                      if (data && data.display_name) {
                          locationAddress = shortenAddress(data.display_name);
                          
                          // Store the address for future use
                          await Post.findByIdAndUpdate(post._id, {
                              'location.address': data.display_name
                          });
                      }
                  }
              } catch (error) {
                  console.error("Error getting location address:", error);
                  // Use fallback location name based on coordinates
                  locationAddress = `Location (${Math.round(postLat * 100) / 100}, ${Math.round(postLng * 100) / 100})`;
              }
          }
      }
      
      // Format date and time
      const postDate = post.date || new Date();
      const formattedDate = postDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
      });
      const formattedTime = postDate.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit'
      });
      
      return {
          ...post.toObject(),
          imageBase64,
          distance: distanceText,
          distanceValue, // Raw distance value for sorting
          locationAddress, // shortened address
          formattedDate,
          formattedTime,
          locationDisplay: `${distanceText} • ${locationAddress}`
      };
    }));
    
    // Sort posts by distance (nearest first)
    // Posts with unknown distance will appear at the end
    formattedPosts.sort((a, b) => {
      // If both posts have valid distance values
      if (a.distanceValue !== Number.MAX_VALUE && b.distanceValue !== Number.MAX_VALUE) {
        return a.distanceValue - b.distanceValue;
      }
      // If only post a has a valid distance
      else if (a.distanceValue !== Number.MAX_VALUE) {
        return -1; // a comes first
      }
      // If only post b has a valid distance
      else if (b.distanceValue !== Number.MAX_VALUE) {
        return 1; // b comes first
      }
      // If neither has a valid distance, sort by date (newest first)
      else {
        return new Date(b.date) - new Date(a.date);
      }
    });
    
    res.render("indexDashboard.ejs", { 
        posts: formattedPosts,
        user: req.user 
    });
  } catch (err) {
    console.error("Error in indexFeed route:", err);
    res.status(500).send({err, message: "Error fetching blogs"});
  }
});

app.get("/indexMap", isAuthenticated, (req,res) => {
  res.render("indexMap.ejs");
})

app.get("/indexResource", isAuthenticated, (req,res) => {
  res.render("indexResource.ejs");
})

app.get("/indexCommunity", isAuthenticated, (req,res) => {
  res.render("indexCommunity.ejs");
})

app.get("/new", isAuthenticated, (req, res) => {
  res.render("addPost.ejs", { 
    heading: "New Post", 
    submit: "Create Post",
    user: req.user
  });
});

app.get("/edit/:id", isAuthenticated, (req, res) => {
    Post.findOne({_id: req.params.id})
    .then(selectedBlog => {
        if (!selectedBlog) {
            return res.status(404).json({ message: "Post not found" });
        }
        
        // Create a copy of the blog object that we can modify
        const postForTemplate = selectedBlog.toObject();
        
        // Check if image exists and has data
        if (selectedBlog.image && selectedBlog.image.data) {
            // Convert image to base64 format
            const imageBase64 = selectedBlog.image.data.toString('base64');
            const contentType = selectedBlog.image.contentType || 'image/jpeg'; // Default to jpeg if not specified
            
            // Add base64 image to the post object
            postForTemplate.image = `data:${contentType};base64,${imageBase64}`;
        } else {
            // Set a placeholder or empty string if no image
            postForTemplate.image = '';
        }
        
        res.render("modify.ejs", {
            heading: "Edit Post",
            submit: "Update Post",
            post: postForTemplate,
            user: req.user
        });
    })
    .catch(err => {
        console.error("Error fetching post:", err);
        res.status(500).json({ err, message: "Error fetching post" });
    });
});

app.get("/delete/:id", isAuthenticated, (req, res) => {
  Post.findByIdAndDelete(req.params.id)
      .then(() => {
        res.redirect("/indexFeed");
      })
      .catch(err => {
        res.status(500).send("Error deleting post");
      });
});

app.get("/addDetails", isAuthenticated ,(req,res) => {
    if(req.user.name){
        res.redirect('/');
    } else{
        res.render('loginUser.ejs', {user : req.user})
    }
})

app.post("/addDetails", (req,res) => {
    if(req.body.phone){
        User.findOneAndUpdate(
            {email : req.user.email},
            {$set : {phone: req.body.phone, name: req.body.name}}
        )
            .then(result => {
                console.log("update result:", result);
            })
            .catch(err => {
                console.log("Error updating:", err);
            })
    } else{
        User.findOneAndUpdate(
            {phone : req.user.phone},
            {$set : {email: req.body.email, name: req.body.name}}
        )
            .then(result => {
                console.log("update result:", result);
            })
            .catch(err => {
                console.log("Error updating:", err);
            })
    }
    res.redirect("/indexFeed");
})

app.post("/add/posts", isAuthenticated, upload.single('image'), (req, res) => {
    const post = new Post({
        title: req.body.title,
        content: req.body.content,
        author: req.user.email,// Changed from email to phone
        intensity: parseInt( req.body.intensity,10),
        location: {
            type: 'Point',
            coordinates: [parseFloat(req.body.lng), parseFloat(req.body.lat)],
            address: req.body.address
        },
        image: req.file? { 
            data: req.file.buffer,
            contentType: req.file.mimetype
        }: undefined,
        date: new Date()
    });
    
    post.save()
    .then(() => {
        res.redirect("/indexFeed");
    })
    .catch(err => {
        res.status(500).json({ message: "Error creating post", error: err });
    });
});


app.post("/add/posts/:id", isAuthenticated, upload.single('image'), (req, res) => {
    Post.findOne({_id: req.params.id})
      .then(post => {
        if (!post) return res.status(404).json({ message: "Post not found" });
  
        // Only allow updating if the user is the author (optional authorization check)
        if (post.author !== req.user.email) {
          return res.status(403).json({ message: "Not authorized to edit this post" });
        }
  
        // Update the post fields
        if (req.body.title) post.title = req.body.title;
        if (req.body.content) post.content = req.body.content;
  
        // If a new image is provided, update it
        if (req.file) {
          post.image = {
            data: req.file.buffer,
            contentType: req.file.mimetype
          };
        }
  
        // Save the updated post
        return post.save();
      })
      .then(() => {
        res.redirect("/indexFeed");  // Redirect to the blog page after update
      })
      .catch(err => {
        res.status(500).json({ message: "Error updating post", error: err });
      });
  });


// Add this route to your Express app
app.get('/api/user/profile', isAuthenticated, async (req, res) => {
  try {
    // Find the user in the database
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return only necessary user information
    res.json({
      name: user.name || 'User',
      email: user.email,
      phone: user.phone,
      role: user.role,
      // Only return location if it's valid (not default 0,0)
      location: user.location && user.location.coordinates && 
               (Math.abs(user.location.coordinates[0]) > 0.0001 || 
                Math.abs(user.location.coordinates[1]) > 0.0001) ? 
                {
                  latitude: user.location.coordinates[1],  // MongoDB stores as [lng, lat]
                  longitude: user.location.coordinates[0]
                } : null
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching profile information' 
    });
  }
});

app.post('/api/user/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }
    
    // Update user in database
    await User.findByIdAndUpdate(req.user._id, {
      name,
      email,
      phone
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

app.get("/profile", isAuthenticated, (req, res) => {
  res.render("profile.ejs", { user: req.user });
});


// Add a route to update user location
// Add this route to your Express app
app.post('/api/user/location', isAuthenticated, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    // Validate the coordinates
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates provided' 
      });
    }
    
    // Update user's location in the database
    // NOTE: MongoDB GeoJSON requires [longitude, latitude] order
    await User.findByIdAndUpdate(req.user._id, {
      'location.coordinates': [longitude, latitude],
      'location.type': 'Point',
      'location.lastUpdated': new Date()
    });
    
    res.json({ success: true, message: 'Location updated successfully' });
  } catch (err) {
    console.error('Error updating user location:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating location'
    });
  }
});

// Route to get posts for map view
router.get('/api/posts', async (req, res) => {
  try {
    console.log('API Request to /api/posts with query:', req.query);
    const { lat, lng, radius = 25000 } = req.query; // radius in meters
    
    let query = {};
    
    // If coordinates are provided, filter by proximity
    if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
      console.log(`Searching for posts near [${lat}, ${lng}] within ${radius}m`);
      query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius, 10)
          }
        }
      };
    } else {
      console.log('No valid coordinates provided, returning all posts');
    }
    
    console.log('MongoDB query:', JSON.stringify(query));
    
    // If no coordinates, just get recent posts
    const posts = await Post.find(query)
      .select('title content intensity location createdAt')
      .sort({ createdAt: -1 })
      .limit(100);
    
    console.log(`Found ${posts.length} posts`);
    
    // Check if we got results
    if (posts.length === 0) {
      console.log('No posts found matching query');
    } else {
      // Log the first few posts for debugging
      console.log('Sample posts:', posts.slice(0, 2).map(p => ({
        title: p.title,
        loc: p.location && p.location.coordinates,
        intensity: p.intensity
      })));
    }
    
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Passport session serialization
passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser((id, cb) => {
  User.findById(id)
    .then(user => {
      cb(null, user);
    })
    .catch(err => {
      cb(err);
    });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});