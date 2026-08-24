import { create } from 'zustand';
import type { BulkMapData, DayOfWeek, StationProbability } from './types';

export type Metric = 'bike' | 'ebike' | 'dock' | 'reliability' | 'stress' | 'fullness';
export type MapMode = 'stations' | 'surface';
export type BikeType = 'any' | 'classic' | 'ebike';

/** Map frontend metric keys to backend API param values. */
export const METRIC_TO_API: Record<Metric, string> = {
  bike:        'bikes',
  ebike:       'ebikes',
  dock:        'docks',
  reliability: 'bikes',   // reliability uses bike data as proxy for now
  stress:      'bikes',   // stress uses bike data, inverted in display
  fullness:    'bikes',   // fullness = mean_inventory / capacity, uses bike data
};

/** Short display label for each metric — shared by the map controls bar and station tooltip. */
export const METRIC_LABEL: Record<Metric, string> = {
  bike:        'Bike',
  ebike:       'E-Bike',
  dock:        'Dock',
  reliability: 'Reliability',
  stress:      'Stress',
  fullness:    '% Full',
};

interface CommutePlan {
  originId: string;
  destId: string;
  bikeType: BikeType;
}

interface AppState {
  // Time & day
  selectedDay: DayOfWeek;
  selectedTime: number;       // minutes since midnight

  // Map
  selectedMetric: Metric;
  mapMode: MapMode;
  selectedStationId: string | null;

  // Commute
  commute: CommutePlan | null;

  // UI
  focusStress: boolean;
  animation: { playing: boolean };

  // Data cache
  currentMapData: StationProbability[];
  bulkCache: Partial<Record<string, BulkMapData>>;
  mapDataLoading: boolean;

  // Actions
  setDay: (day: DayOfWeek) => void;
  setTime: (minutes: number) => void;
  setMetric: (metric: Metric) => void;
  setMapMode: (mode: MapMode) => void;
  selectStation: (id: string | null) => void;
  setCommute: (plan: CommutePlan | null) => void;
  setFocusStress: (v: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentMapData: (data: StationProbability[]) => void;
  setBulkCache: (key: string, data: BulkMapData) => void;
  setMapDataLoading: (v: boolean) => void;
  stepTime: () => void;
}

function getCurrentDayTime(): { day: DayOfWeek; minutes: number } {
  const now = new Date();
  // JS getDay(): 0=Sun,1=Mon...6=Sat. Frontend uses 0=Mon...6=Sun. Convert:
  const day = ((now.getDay() + 6) % 7) as DayOfWeek;
  const minutes = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  return { day, minutes };
}

const { day: initialDay, minutes: initialMinutes } = getCurrentDayTime();

export const useStore = create<AppState>((set, get) => ({
  selectedDay: initialDay,
  selectedTime: initialMinutes,
  selectedMetric: 'ebike',
  mapMode: 'stations',
  selectedStationId: null,
  commute: null,
  focusStress: false,
  animation: { playing: false },
  currentMapData: [],
  bulkCache: {},
  mapDataLoading: false,

  setDay: (day) => set({ selectedDay: day }),
  setTime: (minutes) => set({ selectedTime: minutes }),
  setMetric: (metric) => set({ selectedMetric: metric }),
  setMapMode: (mode) => set({ mapMode: mode }),
  selectStation: (id) => set({ selectedStationId: id }),
  setCommute: (plan) => set({ commute: plan }),
  setFocusStress: (v) => set({ focusStress: v }),
  setPlaying: (playing) => set((s) => ({ animation: { ...s.animation, playing } })),
  setCurrentMapData: (data) => set({ currentMapData: data }),
  setBulkCache: (key, data) => set((s) => ({ bulkCache: { ...s.bulkCache, [key]: data } })),
  setMapDataLoading: (v) => set({ mapDataLoading: v }),

  stepTime: () => {
    const { selectedTime } = get();
    set({ selectedTime: (selectedTime + 5) % (24 * 60) });
  },
}));
