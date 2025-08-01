import path from 'path';
import { dirname } from 'path';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// User Schema - Updated to support Google OAuth and email verification
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Not required for Google OAuth users
  googleId: { type: String }, // For Google OAuth users
  profilePicture: { type: String }, // Store Google profile picture
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  isVerified: { type: Boolean, default: false }, // For email verification
  verificationCode: { type: String }, // Store verification code
  verificationCodeExpires: { type: Date }, // Code expiration
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Email provider configurations
const EMAIL_PROVIDERS = {
  gmail: {
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false
  },
  outlook: {
    service: 'hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false
  },
  yahoo: {
    service: 'yahoo',
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false
  },
  icloud: {
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false
  },
  // Generic SMTP fallback
  generic: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || false
  }
};

// Detect email provider from email address
const detectEmailProvider = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (domain?.includes('gmail')) return 'gmail';
  if (domain?.includes('outlook') || domain?.includes('hotmail') || domain?.includes('live')) return 'outlook';
  if (domain?.includes('yahoo')) return 'yahoo';
  if (domain?.includes('icloud') || domain?.includes('me.com')) return 'icloud';
  
  return 'generic';
};

// Enhanced validation for different email providers
const validateEmail = (email) => {
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  // Check for common email providers
  const domain = email.split('@')[1]?.toLowerCase();
  const supportedDomains = [
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.in',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'protonmail.com', 'mail.com',
    // Add more as needed
  ];
  
  // Don't restrict to only supported domains, but provide helpful info
  const isKnownProvider = supportedDomains.some(supportedDomain => 
    domain?.includes(supportedDomain.split('.')[0])
  );
  
  return { 
    valid: true, 
    isKnownProvider,
    provider: detectEmailProvider(email),
    domain 
  };
};

// Create email Transport with automatic provider detection
const createEmailTransport = (recipientEmail = null) => {
  const emailConfig = {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD,
    service: process.env.EMAIL_SERVICE || 'gmail'
  };

  console.log('Email Config:', {
    user: emailConfig.user,
    hasPassword: !!emailConfig.password,
    service: emailConfig.service
  });

  // If we have a recipient email, try to optimize for their provider
  let providerConfig;
  if (recipientEmail) {
    const detectedProvider = detectEmailProvider(recipientEmail);
    providerConfig = EMAIL_PROVIDERS[detectedProvider];
  } else {
    // Use configured service or default to Gmail
    const serviceKey = emailConfig.service.toLowerCase();
    providerConfig = EMAIL_PROVIDERS[serviceKey] || EMAIL_PROVIDERS.gmail;
  }

  // For Gmail, Yahoo, Hotmail - use the simpler service-based config
  if (providerConfig.service === 'gmail' || providerConfig.service === 'yahoo' || providerConfig.service === 'hotmail') {
    return nodemailer.createTransport({
      service: providerConfig.service,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      }
    });
  }

  // For other providers, use SMTP config
  return nodemailer.createTransport({
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.password
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    }
  });
};

// Create HTML email template
const createEmailHTML = (code, firstName) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
      <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 30px; border-radius: 10px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">🎥 Video Call App</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Secure Video Calling</p>
      </div>
      
      <div style="background: white; padding: 40px; border-radius: 10px; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #1e293b; margin-top: 0;">Hi ${firstName}!</h2>
        <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
          Welcome to Video Call App! To complete your sign-in, please use the verification code below:
        </p>
        
        <div style="background: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
          <h1 style="color: #3b82f6; font-size: 36px; margin: 0; letter-spacing: 4px; font-family: monospace;">
            ${code}
          </h1>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-bottom: 0;">
          This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
        </p>
        
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-top: 20px;">
          <p style="color: #92400e; font-size: 13px; margin: 0;">
            <strong>Note:</strong> This email works with all email providers including Gmail, Yahoo, Outlook, iCloud, and more.
          </p>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        <p>Video Call App - Connecting people worldwide</p>
        <p>This service works with all major email providers</p>
      </div>
    </div>
  `;
};

// Create plain text email template
const createEmailText = (code, firstName) => {
  return `
    Video Call App - Verification Code
    
    Hi ${firstName}!
    
    Welcome to Video Call App! Your verification code is: ${code}
    
    This code will expire in 10 minutes.
    
    If you didn't request this code, please ignore this email.
    
    Note: This service works with all major email providers including Gmail, Yahoo, Outlook, iCloud, and more.
    
    Video Call App - Connecting people worldwide
  `;
};

// Test email configuration for different providers
const testEmailConfig = async () => {
  try {
    console.log('🧪 Testing email configuration...');
    
    // Test with Gmail transport first
    const gmailTransport = createEmailTransport('test@gmail.com');
    await gmailTransport.verify();
    console.log('✅ Gmail configuration is valid');
    
    // Test generic transport
    const genericTransport = createEmailTransport();
    await genericTransport.verify();
    console.log('✅ Generic email configuration is valid');
    
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    console.log('💡 Tips for email setup:');
    console.log('   - For Gmail: Enable 2FA and use App Password');
    console.log('   - For Yahoo: Enable 2FA and use App Password');
    console.log('   - For Outlook: Use regular password or App Password');
    console.log('   - Set EMAIL_USER and EMAIL_APP_PASSWORD in .env file');
    return false;
  }
};

// Generate verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

// Enhanced email sending with retry logic and provider optimization
const sendVerificationEmail = async (email, code, firstName, retryCount = 0) => {
  const maxRetries = 2;
  
  try {
    console.log(`Attempting to send verification email to: ${email} (attempt ${retryCount + 1})`);
    
    const transport = createEmailTransport(email);
    
    // Verify transport configuration
    await transport.verify();
    console.log('Email transport verified successfully');
    
    const mailOptions = {
      from: {
        name: 'Video Call App',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Video Call App - Verification Code',
      html: createEmailHTML(code, firstName),
      text: createEmailText(code, firstName)
    };

    const result = await transport.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', result.messageId);
    return result;
    
  } catch (error) {
    console.error(`❌ Email sending error (attempt ${retryCount + 1}):`, {
      message: error.message,
      code: error.code,
      command: error.command
    });
    
    // Retry with different configuration
    if (retryCount < maxRetries) {
      console.log(`Retrying email send with generic SMTP config...`);
      
      // Try with generic SMTP settings
      try {
        const genericTransport = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        
        const result = await genericTransport.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Video Call App - Verification Code',
          html: createEmailHTML(code, firstName),
          text: createEmailText(code, firstName)
        });
        
        console.log('✅ Email sent with generic transport:', result.messageId);
        return result;
        
      } catch (retryError) {
        console.error('Retry also failed:', retryError.message);
        return sendVerificationEmail(email, code, firstName, retryCount + 1);
      }
    }
    
    throw new Error(`Email sending failed after ${maxRetries + 1} attempts: ${error.message}`);
  }
};

// Alternative: Mock email service for development
const sendMockVerificationEmail = async (email, code, firstName) => {
  const validation = validateEmail(email);
  console.log('🔧 DEVELOPMENT MODE - Mock Email Service');
  console.log('=======================================');
  console.log(`To: ${email} (${validation.provider} provider detected)`);
  console.log(`Subject: Video Call App - Verification Code`);
  console.log(`Hi ${firstName}!`);
  console.log(`Your verification code is: ${code}`);
  console.log('=======================================');
  
  // In development, you can copy this code to test
  return Promise.resolve({ messageId: 'mock-' + Date.now() });
};

// Passport configuration
const setupPassport = () => {
  const baseURL = process.env.NODE_ENV === 'production' 
    ? process.env.BASE_URL || 'http://localhost:5000'
    : 'http://localhost:5000';
  
  const callbackURL = `${baseURL}/auth/google/callback`;

  passport.use(new GoogleStrategy({
    clientID: "179453254509-2do865ooouqnqvfsr7lfrbggc2s1eksi.apps.googleusercontent.com",
    clientSecret: "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",
    callbackURL: callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let existingUser = await User.findOne({ googleId: profile.id });
      
      if (existingUser) {
        return done(null, existingUser);
      }
      
      existingUser = await User.findOne({ email: profile.emails[0].value });
      
      if (existingUser) {
        existingUser.googleId = profile.id;
        existingUser.authProvider = 'google';
        existingUser.profilePicture = profile.photos[0]?.value;
        existingUser.isVerified = true;
        await existingUser.save();
        return done(null, existingUser);
      }
      
      const newUser = new User({
        googleId: profile.id,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        email: profile.emails[0].value,
        profilePicture: profile.photos[0]?.value,
        authProvider: 'google',
        isVerified: true
      });
      
      await newUser.save();
      done(null, newUser);
      
    } catch (error) {
      console.error('Google OAuth error:', error);
      done(error, null);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).select('-password -verificationCode');
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

// Authentication middleware
export const authenticateUser = (req, res, next) => {
  if (req.session.userId || req.user) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};

// Session and Passport middleware
export const setupSession = (app) => {
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/videocall'
    }),
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
  }));

  setupPassport();
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Test email configuration on startup
  testEmailConfig();
};

// Auth routes
export const setupAuthRoutes = (app) => {
  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'login.html'));
  });

  app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'register.html'));
  });

app.get('/dashboard', authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard', 'dashboard.html'));
});


  // Google OAuth routes
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
      req.session.userId = req.user._id;
      req.session.userName = `${req.user.firstName} ${req.user.lastName}`;
      res.redirect('/');
    }
  );

  // Test email endpoint with enhanced provider support
  app.post('/api/test-email', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const validation = validateEmail(email);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const testCode = '123456';
      const firstName = 'Test User';
      
      // Try to send test email
      if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
        await sendMockVerificationEmail(email, testCode, firstName);
        return res.json({ 
          message: 'Mock email sent (check console)', 
          provider: validation.provider,
          mode: 'development' 
        });
      }
      
      await sendVerificationEmail(email, testCode, firstName);
      res.json({ 
        message: `Test email sent successfully to ${validation.provider} email!`,
        provider: validation.provider,
        isKnownProvider: validation.isKnownProvider
      });
      
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({ 
        error: 'Email test failed', 
        details: error.message,
        suggestions: [
          'Check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file',
          'Make sure 2-factor authentication is enabled on Gmail',
          'Generate a new App Password from Google Account settings',
          'Try using mock mode for development'
        ]
      });
    }
  });

  // Enhanced email verification login - Step 1: Send verification code
  app.post('/api/login/send-code', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Validate email with provider detection
      const validation = validateEmail(email);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      let user = await User.findOne({ email });
      
      const verificationCode = generateVerificationCode();
      const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      if (!user) {
        user = new User({
          firstName: 'New',
          lastName: 'User',
          email,
          verificationCode,
          verificationCodeExpires,
          isVerified: false,
          authProvider: 'local'
        });
        await user.save();
      } else {
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save();
      }
      
      // Send verification email with provider-specific optimization
      try {
        if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
          await sendMockVerificationEmail(email, verificationCode, user.firstName);
          return res.json({ 
            message: 'Verification code sent (development mode - check console)',
            email: email,
            provider: validation.provider,
            mode: 'mock',
            code: verificationCode // Only in development
          });
        }
        
        await sendVerificationEmail(email, verificationCode, user.firstName);
        
        res.json({ 
          message: `Verification code sent to your ${validation.provider} email`,
          email: email,
          provider: validation.provider,
          isKnownProvider: validation.isKnownProvider,
          mode: 'real'
        });
        
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        
        // In development, show the code
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 EMAIL FAILED - Development Code Display');
          console.log('==========================================');
          console.log(`Email: ${email}`);
          console.log(`Code: ${verificationCode}`);
          console.log('==========================================');
          
          return res.json({ 
            message: 'Email service temporarily unavailable - verification code displayed in server console',
            email: email,
            provider: validation.provider,
            mode: 'mock-fallback',
            code: verificationCode,
            error: 'Email service error'
          });
        }
        
        // In production, don't reveal the code
        res.status(500).json({ 
          error: `Failed to send verification code to ${validation.provider} email`,
          provider: validation.provider,
          suggestions: [
            'Please check that your email address is correct',
            'Check your spam/junk folder',
            'Try again in a few minutes',
            `Make sure ${email} can receive emails`
          ]
        });
      }
      
    } catch (error) {
      console.error('Send verification code error:', error);
      res.status(500).json({ 
        error: 'Failed to send verification code',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Email verification login - Step 2: Verify code and login
  app.post('/api/login/verify-code', async (req, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and verification code are required' });
      }

      const user = await User.findOne({ 
        email,
        verificationCode: code,
        verificationCodeExpires: { $gt: new Date() }
      });
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }

      // Check if this is a new user
      if (user.firstName === 'New' && user.lastName === 'User') {
        return res.json({
          needsRegistration: true,
          message: 'Please complete your registration',
          tempUserId: user._id
        });
      }

      // Clear verification code and mark as verified
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      user.isVerified = true;
      await user.save();

      req.session.userId = user._id;
      req.session.userName = `${user.firstName} ${user.lastName}`;
      
      res.json({
        message: 'Login successful',
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider
        }
      });
    } catch (error) {
      console.error('Verify code error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // Complete registration for new users
  app.post('/api/complete-registration', async (req, res) => {
    try {
      const { tempUserId, firstName, lastName, password } = req.body;
      
      if (!tempUserId || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      const user = await User.findById(tempUserId);
      if (!user) {
        return res.status(400).json({ error: 'Invalid registration session' });
      }

      user.firstName = firstName;
      user.lastName = lastName;
      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      
      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }
      
      await user.save();

      req.session.userId = user._id;
      req.session.userName = `${user.firstName} ${user.lastName}`;
      
      res.json({
        message: 'Registration completed successfully',
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider
        }
      });
    } catch (error) {
      console.error('Complete registration error:', error);
      res.status(500).json({ error: 'Registration completion failed' });
    }
  });

  // Traditional registration route
  app.post('/api/register', async (req, res) => {
    try {
      const { firstName, lastName, email, password } = req.body;
      
      const validation = validateEmail(email);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.isVerified) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      if (existingUser && !existingUser.isVerified) {
        existingUser.firstName = firstName;
        existingUser.lastName = lastName;
        existingUser.password = hashedPassword;
        await existingUser.save();
      } else {
        const user = new User({
          firstName,
          lastName,
          email,
          password: hashedPassword,
          authProvider: 'local',
          isVerified: false
        });
        
        await user.save();
      }
      
      res.json({ 
        message: 'User registered successfully',
        provider: validation.provider
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Traditional password login
  app.post('/api/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await User.findOne({ email });
      if (!user || !user.isVerified) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      
      if (user.authProvider === 'google' && !user.password) {
        return res.status(400).json({ 
          error: 'This account uses Google Sign-In. Please use the Google login button.' 
        });
      }
      
      if (!user.password) {
        return res.status(400).json({ 
          error: 'Please use email verification or Google sign-in for this account.' 
        });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      
      req.session.userId = user._id;
      req.session.userName = `${user.firstName} ${user.lastName}`;
      
      res.json({ 
        message: 'Login successful',
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      req.logout((err) => {
        if (err) {
          console.error('Passport logout error:', err);
        }
        res.json({ message: 'Logout successful' });
      });
    });
  });

  app.get('/api/user', authenticateUser, async (req, res) => {
    try {
      let user;
      if (req.session.userId) {
        user = await User.findById(req.session.userId).select('-password -verificationCode');
      } else if (req.user) {
        user = req.user;
      }
      
      res.json({ 
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          profilePicture: user.profilePicture,
          authProvider: user.authProvider,
          isVerified: user.isVerified
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user data' });
    }
  });
};

// Export additional utility functions
export { 
  User,
  createEmailTransport, 
  sendVerificationEmail, 
  validateEmail, 
  testEmailConfig,
  detectEmailProvider,
  generateVerificationCode,
  sendMockVerificationEmail 
};