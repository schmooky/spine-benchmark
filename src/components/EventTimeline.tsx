import React, { useState, useEffect, useRef } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

// Define interfaces for the component props and event structure
interface EventTimelineProps {
  spineInstance: Spine;
  currentAnimation: string;
}

interface AnimationEvent {
  name: string;
  time: number;
  value: string | number | boolean | object | null;
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'default';
}

// Event type color mapping
const EVENT_TYPE_COLORS: Record<string, string> = {
  string: '#4caf50', // Green
  number: '#2196f3', // Blue
  boolean: '#ff9800', // Orange
  object: '#9c27b0', // Purple
  default: '#757575'  // Gray for unknown types
};

// Timeline component that displays events in the animation
const EventTimeline: React.FC<EventTimelineProps> = ({ spineInstance, currentAnimation }) => {
  const [events, setEvents] = useState<AnimationEvent[]>([]);
  const [hoverEvent, setHoverEvent] = useState<AnimationEvent | null>(null);
  const [timelineWidth, setTimelineWidth] = useState<number>(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  // Extract events from the animation
  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;
    
    const animation = spineInstance.skeleton.data.findAnimation(currentAnimation);
    if (!animation) return;

    // Set animation duration
    setDuration(animation.duration);
    
    // Extract events from timelines
    const extractedEvents: AnimationEvent[] = [];
    
    // Search through timelines for event timelines
    animation.timelines.forEach((timeline: any) => {
      // Check if this is an event timeline
      if (timeline.events) {
        timeline.events.forEach((evt: any) => {
          const value = evt.data.stringValue || evt.data.intValue || evt.data.floatValue || evt.data.audioPath || null;
          let valueType: AnimationEvent['valueType'] = 'default';
          
          if (typeof value === 'string') valueType = 'string';
          else if (typeof value === 'number') valueType = 'number';
          else if (typeof value === 'boolean') valueType = 'boolean';
          else if (typeof value === 'object' && value !== null) valueType = 'object';
          
          extractedEvents.push({
            name: evt.data.name,
            time: evt.time,
            value: value,
            valueType: valueType
          });
        });
      }
    });
    
    // Sort by time
    extractedEvents.sort((a, b) => a.time - b.time);
    setEvents(extractedEvents);
  }, [spineInstance, currentAnimation]);

  // Update timeline width when it's mounted
  useEffect(() => {
    if (timelineRef.current) {
      setTimelineWidth(timelineRef.current.offsetWidth);
    }
  }, [timelineRef, events]);

  // Animation playback tracking
  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;

    // Start tracking animation time
    let lastTime = 0;
    let animationTime = 0;
    
    const updateAnimation = (time: number) => {
      if (!lastTime) {
        lastTime = time;
        animationFrameRef.current = requestAnimationFrame(updateAnimation);
        return;
      }

      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;
      
      if (isPlaying) {
        if (spineInstance && spineInstance.state) {
          const track = spineInstance.state.tracks[0];
          if (track) {
            animationTime = track.getAnimationTime();
            setCurrentTime(animationTime);
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateAnimation);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateAnimation);
    
    // Detect when animation is playing
    const checkPlayState = () => {
      if (spineInstance && spineInstance.state) {
        const track = spineInstance.state.tracks[0];
        setIsPlaying(track ? !track.trackTime : false);
      }
    };
    
    // Listen for animation events directly from Spine
    const listener = {
      start: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(true);
        }
      },
      complete: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(false);
        }
      },
      event: (entry: any, event: any) => {
        // This is triggered when an event occurs during animation playback
        console.log('Event fired:', event.data.name, event.time, event.data);
      }
    };
    
    spineInstance.state.addListener(listener);
    checkPlayState();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      spineInstance.state.removeListener(listener);
    };
  }, [spineInstance, currentAnimation, isPlaying]);

  // Calculate event position on timeline
  const getEventPosition = (eventTime: number) => {
    if (duration <= 0) return 0;
    return (eventTime / duration) * timelineWidth;
  };

  // Skip to a specific time in the animation
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || !spineInstance || !currentAnimation) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * duration;
    
    // Set spine animation to this time
    const track = spineInstance.state.setAnimation(0, currentAnimation, false);
    if (track) {
      track.trackTime = targetTime;
      setCurrentTime(targetTime);
    }
  };
  
  // Format time display as seconds with 2 decimal places
  const formatTime = (time: number) => {
    return time.toFixed(2) + 's';
  };

  return (
    <div className="event-timeline-container">
      <div className="timeline-header">
        <h3>Animation Events: {currentAnimation}</h3>
        <div className="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      
      <div 
        className="timeline" 
        ref={timelineRef} 
        onClick={handleTimelineClick}
      >
        {/* Timeline track */}
        <div className="timeline-track">
          {/* Current time indicator */}
          <div 
            className="time-indicator" 
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
          
          {/* Event markers */}
          {events.map((event, index) => (
            <div 
              key={index}
              className="event-marker"
              style={{ 
                left: `${(event.time / duration) * 100}%`,
                backgroundColor: EVENT_TYPE_COLORS[event.valueType] 
              }}
              onMouseEnter={() => setHoverEvent(event)}
              onMouseLeave={() => setHoverEvent(null)}
            >
              <div className="event-dot" />
            </div>
          ))}
        </div>
        
        {/* Event tooltip */}
        {hoverEvent && (
          <div 
            className="event-tooltip"
            style={{ 
              left: `${(hoverEvent.time / duration) * 100}%`,
              bottom: '20px'
            }}
          >
            <div className="event-name">{hoverEvent.name}</div>
            <div className="event-time">{formatTime(hoverEvent.time)}</div>
            {hoverEvent.value !== null && (
              <div className="event-value">
                Value: <span>{String(hoverEvent.value)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Event legend */}
      <div className="event-legend">
        {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: color }}></span>
            <span className="legend-label">{type}</span>
          </div>
        ))}
      </div>
      
      {/* Events list */}
      <div className="events-list">
        <h4>Events ({events.length})</h4>
        {events.length > 0 ? (
          <table className="events-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr 
                  key={index}
                  className={currentTime >= event.time && currentTime < event.time + 0.1 ? 'active-event' : ''}
                >
                  <td>{formatTime(event.time)}</td>
                  <td>{event.name}</td>
                  <td>
                    <span 
                      className="type-indicator" 
                      style={{ backgroundColor: EVENT_TYPE_COLORS[event.valueType] }}
                    />
                    {event.valueType}
                  </td>
                  <td>{event.value !== null ? String(event.value) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-events">No events found in this animation</p>
        )}
      </div>
    </div>
  );
};

export default EventTimeline;