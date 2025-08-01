import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setupSession, setupAuthRoutes, User, Meeting } from './auth.js';
import nodemailer from 'nodemailer';
import cron from 'node-cron';

// Schedule meeting endpoint
app.post('/api/schedule-meeting', async (req, res) => {
  try {
    console.log('📅 Received meeting scheduling request:', {
      title: req.body.title,
      date: req.body.date,
      time: req.body.time,
      duration: req.body.duration,
      participantCount: req.body.participants?.length || 0,
      schedulerEmail: req.body.schedulerEmail
    });

    const { title, date, time, duration, participants, description, schedulerEmail } = req.body;

    // Validate required fields
    if (!title || !date || !time || !duration || !schedulerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, date, time, duration, and schedulerEmail are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(schedulerEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduler email format'
      });
    }

    // Validate participant emails
    if (participants && participants.length > 0) {
      for (const participant of participants) {
        if (!emailRegex.test(participant.email)) {
          return res.status(400).json({
            success: false,
            message: `Invalid participant email: ${participant.email}`
          });
        }
      }
    }

    // Create meeting date/time
    const meetingDateTime = new Date(`${date}T${time}:00`);
    
    if (isNaN(meetingDateTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date or time format'
      });
    }

    // Check if meeting is in the future
    const now = new Date();
    if (meetingDateTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Meeting must be scheduled for a future date and time'
      });
    }

    // Find or create scheduler user
    let schedulerUser = await User.findOne({ email: schedulerEmail });
    if (!schedulerUser) {
      // Create a basic user record for the scheduler if they don't exist
      const [firstName, ...lastNameParts] = schedulerEmail.split('@')[0].split('.');
      schedulerUser = new User({
        firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
        lastName: lastNameParts.length > 0 ? lastNameParts.join(' ').charAt(0).toUpperCase() + lastNameParts.join(' ').slice(1) : 'User',
        email: schedulerEmail,
        authProvider: 'local',
        isVerified: false
      });
      await schedulerUser.save();
    }

    // Create meeting record in database
    const meeting = new Meeting({
      title,
      description: description || '',
      dateTime: meetingDateTime,
      duration: parseInt(duration),
      schedulerId: schedulerUser._id,
      schedulerEmail,
      participants: participants || [],
      status: 'scheduled'
    });

    await meeting.save();
    console.log('✅ Meeting saved to database:', meeting._id);

    // Create email content
    const meetingDetails = {
      title,
      date: meetingDateTime.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: meetingDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      duration: `${duration} minutes`,
      description: description || 'No description provided',
      schedulerEmail
    };

    res.json({
      success: true,
      message: 'Meeting scheduled successfully',
      meeting: {
        id: meeting._id,
        title,
        dateTime: meetingDateTime,
        duration,
        participants: participants || [],
        totalNotifications: emailsSent,
        scheduledFor: meetingDateTime.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error scheduling meeting:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule meeting',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});