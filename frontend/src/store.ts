import { create } from 'zustand';
import type { BulkMapData, DayOfWeek, MapMode, Metric, StationProbability } from './types';

interface AppState {
  // Controls
  selectedDay: DayOfWeek;
  selectedTime: number;          // minutes since midnight
  selectedMetric: Metric;
  mapMode: MapMode;
  selectedStationId: string | null;

  // Commute planner
  commute: { originId: string; destId: string } | null;

  // Animation
  animation: { playing: boolean; speedMultiplier: number };

  // Cached map data
  currentMapData: StationProbability[];
  bulkCache: Partial<Record<string, BulkMapData>>; // key = `${day}_${metric}`

  // Actions
  setDay: (day: DayOfWeek) => void;
  setTime: (minutes: number) => void;
  setMetric: (metric: Metric) => void;
  setMapMode: (mode: MapMode) => void;
  selectStation: (id: string | null) => void;
  setCommute: (plan: { originId: string; destId: string } | null) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (multiplier: number) => void;
  setCurrentMapData: (data: StationProbability[]) => void;
  setBulkCache: (key: string, data: BulkMapData) => void;
  stepTime: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  selectedDay: 0,
  selectedTime: 480,   // 8:00 AM default
  selectedMetric: 'bikes',
  mapMode: 'stations',
  selectedStationId: null,
  commute: null,
  animation: { playing: false, speedMultiplier: 1 },
  currentMapData: [],
  bulkCache: {},

  setDay: (day) => set({ selectedDay: day }),
  setTime: (minutes) => set({ selectedTime: minutes }),
  setMetric: (metric) => set({ selectedMetric: metric }),
  setMapMode: (mode) => set({ mapMode: mode }),
  selectStation: (id) => set({ selectedStationId: id }),
  setCommute: (plan) => set({ commute: plan }),
  setPlaying: (playing) => set((s) => ({ animation: { ...s.animation, playing } })),
  setSpeed: (multiplier) => set((s) => ({ animation: { ...s.animation, speedMultiplier: multiplier } })),
  setCurrentMapData: (data) => set({ currentMapData: data }),
  setBulkCache: (key, data) => set((s) => ({ bulkCache: { ...s.bulkCache, [key]: data } })),

  stepTime: () => {
    const { selectedTime } = get();
    const next = (selectedTime + 5) % (24 * 60);
    set({ selectedTime: next });
  },
}));
