import { StationDetailPanel } from '../StationDetail/StationDetailPanel';

export function MapSidebar() {
  return (
    <div className="left-rail">
      <div className="rail-content">
        <StationDetailPanel />
      </div>
    </div>
  );
}
