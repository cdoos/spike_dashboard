import React, { useState, useRef, useMemo } from 'react';
import './Timeline.css';

const Timeline = ({ timeRange, windowSize, totalDataRange = 3500000, onTimeRangeChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const timelineRef = useRef(null);
  const dragStartRef = useRef({ x: 0, timeRange: { start: 0, end: 0 } });

  const windowPosition = useMemo(() => {
    const startPercent = (timeRange.start / totalDataRange) * 100;
    const widthPercent = (windowSize / totalDataRange) * 100;
    return { left: startPercent, width: widthPercent };
  }, [timeRange, windowSize, totalDataRange]);

  const handleWindowMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      dragStartRef.current = { x, timeRange: { ...timeRange } };
    }
  };

  const handleTrackClick = (e) => {
    if (e.target.classList.contains('timeline-window')) return;
    
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickPercent = (x / rect.width) * 100;
      const clickTime = (clickPercent / 100) * totalDataRange;
      
      const newStart = Math.max(0, Math.min(totalDataRange - windowSize, clickTime - windowSize / 2));
      const newEnd = newStart + windowSize;
      
      onTimeRangeChange({ start: newStart, end: newEnd });
    }
  };

  // Monitor container width changes
  React.useEffect(() => {
    if (!timelineRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    resizeObserver.observe(timelineRef.current);
    
    // Set initial width
    setContainerWidth(timelineRef.current.getBoundingClientRect().width);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e) => {
        if (!timelineRef.current) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const deltaX = x - dragStartRef.current.x;
        
        const timeShift = (deltaX / rect.width) * totalDataRange;
        
        const newStart = Math.max(0, Math.min(totalDataRange - windowSize, 
          dragStartRef.current.timeRange.start + timeShift));
        const newEnd = newStart + windowSize;
        
        onTimeRangeChange({ start: newStart, end: newEnd });
      };
      
      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, windowSize, onTimeRangeChange, totalDataRange]);

  const timeLabels = useMemo(() => {
    const labels = [];
    const numLabels = 5;
    
    for (let i = 0; i < numLabels; i++) {
      const time = (i / (numLabels - 1)) * totalDataRange;
      labels.push(`${Math.round(time)}`);
    }
    
    return labels;
  }, [totalDataRange]);

  return (
    <div className="timeline">
      <div 
        className="timeline-track" 
        ref={timelineRef}
        onClick={handleTrackClick}
      >
        <div 
          className={`timeline-window ${isDragging ? 'dragging' : ''}`}
          style={{ 
            left: `${windowPosition.left}%`, 
            width: `${windowPosition.width}%` 
          }}
          onMouseDown={handleWindowMouseDown}
        >
          <div className="timeline-window-edge left"></div>
          <div className="timeline-window-edge right"></div>
        </div>
      </div>
      <div className="timeline-labels">
        {timeLabels.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
    </div>
  );
};

export default Timeline;