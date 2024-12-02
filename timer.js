const express = require('express');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class EventManager {
  constructor() {
    this.events = new Map();
    this.websocketClients = new Set();
  }

  addEvent(event) {
    
    const conflictingEvent = Array.from(this.events.values()).find(
      existingEvent => 
        Math.abs(existingEvent.scheduledTime.getTime() - event.scheduledTime.getTime()) < 3600000 &&
      existingEvent.status !== 'completed'
    );

    if (conflictingEvent) {
      throw new Error('Event conflicts with an existing event');
    }

    this.events.set(event.id, event);
    return event.id;
  }

  
  getEvents(status) {
    if (status) {
      return Array.from(this.events.values()).filter(event => event.status === status);
    }
    return Array.from(this.events.values());
  }

  
  updateEventStatus(eventId, status) {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error('Event not found');
    }
    event.status = status;
    return event;
  }

 
  checkUpcomingEvents() {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

    Array.from(this.events.values())
      .filter(event => 
        event.status === 'pending' && 
        event.scheduledTime <= fiveMinutesFromNow
      )
      .forEach(event => {
        this.notifyEventSoon(event);
        event.status = 'ongoing';
      });
  }

  
  notifyEventSoon(event) {
    const notification = JSON.stringify({
      type: 'event_reminder',
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        timeRemaining: '5 minutes'
      }
    });

    this.websocketClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(notification);
      }
    });
}

  async logCompletedEvents() {
    const completedEvents = Array.from(this.events.values())
      .filter(event => event.status === 'completed');

    if (completedEvents.length > 0) {
      const logPath = path.join(__dirname, 'event_history.log');
      const logEntries = completedEvents.map(event => 
        `${event.id},${event.title},${event.description},${event.scheduledTime},${event.status}`
      );

      await fs.appendFile(logPath, logEntries.join('\n') + '\n', 'utf-8');
    }
  }

 
  registerWebSocketClient(client) {
    this.websocketClients.add(client);
    
    client.on('close', () => {
      this.websocketClients.delete(client);
    });
  }
}


const app = express();
const PORT = process.env.PORT || 3000;
const eventManager = new EventManager();


app.use(express.json());


app.post('/events', (req, res) => {
  try {
    const { title, description, scheduledTime } = req.body;
    const event = {
      id: uuidv4(),
      title,
      description,
      scheduledTime: new Date(scheduledTime),
      status: 'pending'
    };


    

    const eventId = eventManager.addEvent(event);
    res.status(201).json({ 
      message: 'Event created successfully', 
      eventId 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


app.get('/events', (req, res) => {
  const { status } = req.query;
  const events = eventManager.getEvents(status);
  res.json(events);
  
});


app.patch('/events/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updatedEvent = eventManager.updateEventStatus(id, status);
    res.json(updatedEvent);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});


const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  eventManager.registerWebSocketClient(ws);
});


cron.schedule('* * * * *', () => {
  eventManager.checkUpcomingEvents();
});


cron.schedule('0 0 * * *', () => {
  eventManager.logCompletedEvents();
});

module.exports = app;

