import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store';
import type { CommuteResult, Recommendation } from '../types';

export function useCommute() {
  const { commute, selectedDay, selectedTime } = useStore();
  const [result, setResult] = useState<CommuteResult | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!commute) {
      setResult(null);
      setRecommendations([]);
      return;
    }

    setLoading(true);
    const { originId, destId } = commute;

    Promise.all([
      api.commute.success(originId, destId, selectedDay, selectedTime),
      api.commute.recommendations(originId, destId, selectedDay, selectedTime),
    ])
      .then(([successResult, recs]) => {
        setResult(successResult);
        setRecommendations(recs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [commute, selectedDay, selectedTime]);

  return { result, recommendations, loading };
}
