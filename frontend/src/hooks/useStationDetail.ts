import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';
import type { StationDetail } from '../types';

export function useStationDetail() {
  const { selectedStationId, selectedDay, selectedTime } = useStore();
  const [detail, setDetail] = useState<StationDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStationId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    api.stations
      .detail(selectedStationId, selectedDay, selectedTime)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedStationId, selectedDay, selectedTime]);

  return { detail, loading };
}
