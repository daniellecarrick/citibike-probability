railway volume files -p citibike-probability -e production -s citibike-collector --volume citibike-data-fdbH download / ./citibike-data-fdbH-backup


railway link
railway volume files --volume citibike-data-fdbH download / ./citibike-data-fdbH-backup

Pickup Notes:
- We are waiting for citibike-collector prod data backup to download. This looks like it will take 5-7 hours
  - Failed, timeout
  - Backup snapshot taken in Railway collector service of the data volumehow
- We should consider ways to roll out the new application refactor and merge in the existing data dump with the newly collected samples
- Look into reassigning a volume from one resource to another in railway
  - Looks like we can, need to see what the best option is for cutover to minimize data loss and down time while we reassign the volume and deploy the new api. We still don't know if the new app version will build and deploy successfully so if that fails it will complicate things. Hard to verify without interruption here.
- Check that refactored code is still writing to appropriate sqlite db target and that this will continue to work on the be container after deploying the refactor


Todo:
- Test in prod
- Verify data collection is working in prod with transferred data volume
- Verify data is not being pulled redundantly in prod
- Clean up dup data pulling with dup bg collector locally
- Clean up unmounted backup volume
- Eventually, delete separate collector service. Collection is integrated into the API service now

data amount query for validation

python3 -c "
import sqlite3, os
db = os.environ.get('DB_PATH', os.path.join(os.environ['RAILWAY_VOLUME_MOUNT_PATH'], 'citibike.db'))
c = sqlite3.connect(db)
print('latest poll:', c.execute('SELECT MAX(timestamp), datetime(MAX(timestamp), \"unixepoch\") FROM station_snapshots').fetchone())
print('real rows in last hour:', c.execute('SELECT COUNT(*) FROM station_snapshots WHERE timestamp > strftime(\"%s\",\"now\",\"-1 hour\") AND is_seeded = 0').fetchone())
print('total rows:', c.execute('SELECT COUNT(*) FROM station_snapshots').fetchone())
"


Performance improvements summary
Endpoint / operation	Before	After	Improvement
/api/health	~59s	~1.4s	~42x faster
/api/stations	~30s+ (unresponsive/timing out)	~0.3s	~100x faster
/api/map (filtered probability query)	~8.3s (best case) up to 60s timeout	~0.4s	20–150x faster
/api/map/bulk (any metric)	60s timeout / "several minutes"	0.55–0.78s	from broken to instant
Bulk payload size (raw JSON, uncompressed)	104MB	9.1MB	91% smaller
Hourly rollup maintenance	230s (full 3.46M-row rescan, every hour)	4.95s (incremental)	~46x faster, and now runs on a much smaller footprint every hour instead of a full scan
Full rollup rebuild frequency	Every hour	Once daily (correctness backstop only)	24x less often
What actually fixed each layer, in order of how we found them:

Payload shape — /api/map/bulk was repeating each station's full UUID 288 times and shipping an always-null field; restructured to columnar arrays, cutting raw size 91% (104MB → 9.1MB).
Cache lifetime mismatch — the bulk-response cache expired every 5 minutes even though the data it reads only changes hourly, so it was recomputing an expensive scan 12x more often than necessary.
The real bottleneck — the rollup table itself was being fully rebuilt from a 230-second, 3.46-million-row scan every single hour, regardless of how little new data had arrived (~30K new rows/hour out of millions). That's now incremental — only the newly-arrived and newly-aged-out slices are touched — cutting the routine hourly cost to under 5 seconds.
Never blocking a live request on any of this — the stale-while-revalidate cache means user-facing requests never wait on recomputation at all; a scheduler refreshes everything in the background after each rollup update, so requests just read whatever's cached.
Also fixed along the way: a silent background-task-crash visibility bug, a collector/healthcheck disk-contention issue that was taking prod down on deploy, and confirmed all of this holds up against your real ~6GB production database, not just synthetic test data.

