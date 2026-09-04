import { useState, useEffect, useRef } from "react";
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
  History,
  Check,
} from "lucide-react";
import type { ActivityEntry } from "../../types/domain";
import "./timetravel.css";

export interface TimeTravelBarProps {
  isOpen: boolean;
  activities: ActivityEntry[];
  onRestoreStep: (stepIndex: number) => void;
  onClose: () => void;
}

export function TimeTravelBar({
  isOpen,
  activities,
  onRestoreStep,
  onClose,
}: TimeTravelBarProps) {
  const totalSteps = activities.length;
  const [stepIndex, setStepIndex] = useState(() => Math.max(0, activities.length - 1));
  const [isPlaying, setIsPlaying] = useState(false);
  const [justRestored, setJustRestored] = useState(false);
  const playTimerRef = useRef<number | null>(null);


  // Initialize at the latest step when opened
  useEffect(() => {
    if (isOpen && totalSteps > 0) {
      setStepIndex(totalSteps - 1);
    }
  }, [isOpen, totalSteps]);

  // Autoplay loop
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = window.setInterval(() => {
        setStepIndex((prev) => {
          if (prev + 1 >= totalSteps) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 700);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, totalSteps]);

  if (!isOpen || totalSteps === 0) return null;

  const currentActivity = activities[stepIndex] || activities[0];

  const handleStepChange = (newIndex: number) => {
    setIsPlaying(false);
    setStepIndex(newIndex);
  };

  const handleRestore = () => {
    onRestoreStep(stepIndex);
    setJustRestored(true);
    setTimeout(() => setJustRestored(false), 2000);
  };

  return (
    <div className="bf-timetravel-bar" role="region" aria-label="Time Travel & State Replay Bar">
      <div className="bf-timetravel-top">
        <div className="bf-timetravel-badge">
          <History size={14} />
          <span>Time-Travel Slider</span>
        </div>

        <div className="bf-timetravel-current-info">
          <span>Step {stepIndex + 1}:</span>
          <span className="bf-timetravel-cmd-tag">{currentActivity?.command}</span>
          <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>
            ({currentActivity?.origin})
          </span>
        </div>

        <button
          type="button"
          className="bf-exit-timetravel-btn"
          onClick={onClose}
          title="Return to live workspace"
        >
          <X size={12} />
          <span>Exit</span>
        </button>
      </div>

      {/* Scrubber slider */}
      <div className="bf-timetravel-slider-row">
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={stepIndex}
          className="bf-timetravel-range-input"
          onChange={(e) => handleStepChange(Number(e.target.value))}
          aria-label="Scrub through historical events"
        />
        <span className="bf-timetravel-step-pill">
          {stepIndex + 1} / {totalSteps}
        </span>
      </div>

      {/* Control Buttons */}
      <div className="bf-timetravel-controls">
        <div className="bf-timetravel-playback-btns">
          <button
            type="button"
            className="bf-playback-btn"
            disabled={stepIndex <= 0}
            onClick={() => handleStepChange(0)}
            title="Jump to initial state"
          >
            <SkipBack size={13} />
          </button>

          <button
            type="button"
            className="bf-playback-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause playback" : "Play step-by-step history"}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <button
            type="button"
            className="bf-playback-btn"
            disabled={stepIndex >= totalSteps - 1}
            onClick={() => handleStepChange(totalSteps - 1)}
            title="Jump to present state"
          >
            <SkipForward size={13} />
          </button>
        </div>

        <button
          type="button"
          className="bf-restore-btn"
          onClick={handleRestore}
          title="Restore workspace state to this revision"
        >
          {justRestored ? <Check size={13} /> : <RotateCcw size={13} />}
          <span>{justRestored ? "State Restored!" : "Restore this State"}</span>
        </button>
      </div>
    </div>
  );
}
