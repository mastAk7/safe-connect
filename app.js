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

// Google authentication strategy
passport.use(
  "google",
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
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
    const { latitude, longitude, emergencyType, description, severity,isAnonymous } = req.body;
    
    if (!latitude || !longitude || !emergencyType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Update user's current location
    await User.findByIdAndUpdate(req.user._id, {
      'location.coordinates': [longitude, latitude],
      'location.lastUpdated': new Date()
    });
    
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
    
    await alert.save();
    
    res.json({
      success: true,
      message: 'Emergency alert sent to nearest volunteers',
      volunteers: nearestVolunteers.length
    });
  } catch (error) {
    console.error('SOS alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to sendalert' });
  }
});  

app.post("/api/sos/cancel", isAuthenticated, async (req, res) => {
  try {
    const { alertId } = req.body;
    
    // Find and update the active alert for this user
    await Emergency.findOneAndUpdate(
      { _id: alertId, user: req.user._id, status: 'active' },
      { status: 'cancelled' }
    );
    
    res.json({ success: true, message: 'Emergency alert cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel alert' });
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



// Authentication routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/blog");
  } else {
    res.render("home.ejs");
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


// Blog routes (protected by authentication)
app.get("/blog", isAuthenticated, (req, res) => {
    Post.find({})
    .then(blogArray => {
        const formattedPosts = blogArray.map(post => {
          let imageBase64 = null;
          if (post.image && post.image.data) {
            imageBase64 = `data:${post.image.contentType};base64,${post.image.data.toString('base64')}`;
          }
          return {
            ...post.toObject(),
            imageBase64
          };
        });
  
        res.render("index.ejs", { 
          posts: formattedPosts,
          user: req.user 
        });
    })
    .catch(err => {
        res.send({err, message: "Error fetching blogs"});
    });
});

app.get("/new", isAuthenticated, (req, res) => {
  res.render("modify.ejs", { 
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
        res.redirect("/blog");
      })
      .catch(err => {
        res.status(500).send("Error deleting post");
      });
});

app.get("/addDetails", isAuthenticated ,(req,res) => {
    if(req.user.name){
        res.redirect('/');
    } else{
        res.render('addDetails.ejs', {user : req.user})
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
    res.redirect("/blog");
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
        res.redirect("/blog");
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
        res.redirect("/blog");  // Redirect to the blog page after update
      })
      .catch(err => {
        res.status(500).json({ message: "Error updating post", error: err });
      });
  });






// Route to get posts for map view
router.get('/api/posts', async (req, res) => {
    try {
      const { lat, lng, radius = 25000 } = req.query; // radius in meters
      
      let query = {};
      
      // If coordinates are provided, filter by proximity
      if (lat && lng) {
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
      }
      
      const posts = await Post.find(query)
        .select('title content intensity location createdAt')
        .sort({ createdAt: -1 })
        .limit(100);
      
      res.json(posts);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ error: 'Server error' });
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