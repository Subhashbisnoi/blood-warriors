import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { DivIcon } from 'leaflet';
import TopBar from '../components/layout/TopBar';
import { createMatch } from '../api/match';
import apiClient from '../api/client';
import type { DonorCandidate } from '../types';

// Fix leaflet default marker icon broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type ContactState = 'idle' | 'sending' | 'awaiting' | 'confirming' | 'confirmed';

interface City { name: string; state: string; lat: number; lng: number; }

const INDIA_CITIES: City[] = [
  { name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777 },
  { name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  { name: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319 },
  { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  { name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577 },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185 },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376 },
  { name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538 },
  { name: 'Ludhiana', state: 'Punjab', lat: 30.9009, lng: 75.8573 },
  { name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081 },
  { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
  { name: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178 },
  { name: 'Rajkot', state: 'Gujarat', lat: 22.3039, lng: 70.8022 },
  { name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739 },
  { name: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lng: 74.7973 },
  { name: 'Aurangabad', state: 'Maharashtra', lat: 19.8762, lng: 75.3433 },
  { name: 'Amritsar', state: 'Punjab', lat: 31.6340, lng: 74.8723 },
  { name: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0330, lng: 73.0297 },
  { name: 'Allahabad', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463 },
  { name: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096 },
  { name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  { name: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864 },
  { name: 'Gwalior', state: 'Madhya Pradesh', lat: 26.2183, lng: 78.1828 },
  { name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.6480 },
  { name: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243 },
  { name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198 },
  { name: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296 },
  { name: 'Kota', state: 'Rajasthan', lat: 25.2138, lng: 75.8648 },
  { name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Solapur', state: 'Maharashtra', lat: 17.6805, lng: 75.9064 },
  { name: 'Mysuru', state: 'Karnataka', lat: 12.2958, lng: 76.6394 },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', lat: 10.7905, lng: 78.7047 },
  { name: 'Bareilly', state: 'Uttar Pradesh', lat: 28.3670, lng: 79.4304 },
  { name: 'Gurgaon', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  { name: 'Jalandhar', state: 'Punjab', lat: 31.3260, lng: 75.5762 },
  { name: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245 },
  { name: 'Warangal', state: 'Telangana', lat: 17.9689, lng: 79.5941 },
  { name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366 },
  { name: 'Guntur', state: 'Andhra Pradesh', lat: 16.3067, lng: 80.4365 },
  { name: 'Gorakhpur', state: 'Uttar Pradesh', lat: 26.7606, lng: 83.3732 },
  { name: 'Bikaner', state: 'Rajasthan', lat: 28.0229, lng: 73.3119 },
  { name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910 },
  { name: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029 },
  { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673 },
  { name: 'Nellore', state: 'Andhra Pradesh', lat: 14.4426, lng: 79.9865 },
  { name: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322 },
  { name: 'Kolhapur', state: 'Maharashtra', lat: 16.7050, lng: 74.2433 },
  { name: 'Ajmer', state: 'Rajasthan', lat: 26.4499, lng: 74.6399 },
  { name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125 },
  { name: 'Kozhikode', state: 'Kerala', lat: 11.2588, lng: 75.7804 },
  { name: 'Mangaluru', state: 'Karnataka', lat: 12.9141, lng: 74.8560 },
  { name: 'Hubli-Dharwad', state: 'Karnataka', lat: 15.3647, lng: 75.1240 },
  { name: 'Belgaum', state: 'Karnataka', lat: 15.8497, lng: 74.4977 },
  { name: 'Jammu', state: 'Jammu & Kashmir', lat: 32.7266, lng: 74.8570 },
  { name: 'Siliguri', state: 'West Bengal', lat: 26.7271, lng: 88.3953 },
  { name: 'Jhansi', state: 'Uttar Pradesh', lat: 25.4484, lng: 78.5685 },
  { name: 'Salem', state: 'Tamil Nadu', lat: 11.6643, lng: 78.1460 },
  { name: 'Tirunelveli', state: 'Tamil Nadu', lat: 8.7139, lng: 77.7567 },
  { name: 'Erode', state: 'Tamil Nadu', lat: 11.3410, lng: 77.7172 },
  { name: 'Tiruppur', state: 'Tamil Nadu', lat: 11.1085, lng: 77.3411 },
];

function MapFlyTo({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, 12, { duration: 1.2 }); }, [center, map]);
  return null;
}

function MapFitBounds({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.length > 1) {
      map.fitBounds(bounds as [number, number][], { padding: [40, 40], maxZoom: 13 });
    }
  }, [bounds, map]);
  return null;
}

function makePinIcon(color: string, label?: string): DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      ${label ? `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">${label}</div>` : ''}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="5" fill="#fff"/>
      </svg>
    </div>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

const GREEN_ICON = makePinIcon('#16a34a');
const RED_ICONS = [0, 1, 2, 3, 4].map(i => makePinIcon('#dc2626', `#${i + 1}`));

function donorLatLng(
  donor: { distance_km: number | null; latitude: number | null; longitude: number | null },
  rank: number,
  patientLat: number,
  patientLng: number
): [number, number] {
  if (donor.latitude && donor.longitude) {
    return [donor.latitude, donor.longitude];
  }
  const dist = donor.distance_km ?? 10;
  const angle = (rank * 72 + 15) * (Math.PI / 180);
  const latOffset = dist / 111;
  const lngOffset = dist / (111 * Math.cos(patientLat * Math.PI / 180));
  return [patientLat + latOffset * Math.sin(angle), patientLng + lngOffset * Math.cos(angle)];
}

function DonorMap({ city, candidates }: { city: City; candidates: DonorCandidate[] }) {
  const donorPositions = useMemo(
    () => candidates.map((c, i) => donorLatLng(c, i, city.lat, city.lng)),
    [candidates, city]
  );
  const bounds = useMemo(
    () => [[city.lat, city.lng] as [number, number], ...donorPositions],
    [city, donorPositions]
  );
  return (
    <div className="mb-md rounded-xl border border-outline-variant overflow-hidden" style={{ height: 280 }}>
      <MapContainer center={[city.lat, city.lng]} zoom={11} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <MapFitBounds bounds={bounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[city.lat, city.lng]} icon={GREEN_ICON}>
          <Popup><strong>📍 {city.name}, {city.state}</strong><br />Patient / Hospital</Popup>
        </Marker>
        {candidates.map((c, i) => (
          <Marker key={c.user_id_hash_short} position={donorPositions[i]} icon={RED_ICONS[Math.min(i, 4)]}>
            <Popup>
              <strong>Donor #{c.rank} — {c.blood_group}</strong><br />
              {c.donor_type} · {c.donations_till_date} donations<br />
              Score: {c.score?.toFixed(2)} · {c.distance_km != null ? `${c.distance_km} km` : '—'}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;
const BG_MAP: Record<string, string> = {
  'A+': 'A Positive', 'A-': 'A Negative', 'B+': 'B Positive', 'B-': 'B Negative',
  'O+': 'O Positive', 'O-': 'O Negative', 'AB+': 'AB Positive', 'AB-': 'AB Negative',
};

function tierColor(tier: string) {
  if (tier === 'Tier1') return 'text-emerald-600';
  if (tier === 'Tier2') return 'text-amber-600';
  return 'text-on-surface-variant';
}

function tierIcon(tier: string) {
  if (tier === 'Tier1') return 'star';
  if (tier === 'Tier2') return 'star_half';
  return 'star_border';
}

function CityDropdown({ city, onChange }: { city: City; onChange: (c: City) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const sorted = [...INDIA_CITIES].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search.trim()
    ? sorted.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.state.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  React.useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg py-sm pl-10 pr-8 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer text-left"
      >
        <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">location_on</span>
        {city.name} — {city.state}
        <span className="material-symbols-outlined absolute right-sm top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-outline-variant rounded-lg shadow-lg" style={{ zIndex: 9999 }}>
          <div className="p-2 border-b border-outline-variant">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search city..."
              className="w-full px-3 py-1.5 text-body-md border border-outline-variant rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-md py-sm text-body-md text-on-surface-variant">No results</div>
            ) : filtered.map(c => (
              <button
                key={`${c.name}|${c.state}`}
                type="button"
                onClick={() => { onChange(c); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-md py-sm text-body-md hover:bg-surface-container transition-colors ${c.name === city.name && c.state === city.state ? 'bg-primary-container text-on-primary font-bold' : 'text-on-surface'}`}
              >
                {c.name} — {c.state}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchPage() {
  const navigate = useNavigate();
  const [selectedBG, setSelectedBG] = useState('O+');
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [units, setUnits] = useState(1);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<DonorCandidate[] | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState('');
  const [contactState, setContactState] = useState<Record<number, ContactState>>({});
  const [confirmedRank, setConfirmedRank] = useState<number | null>(null);
  const [city, setCity] = useState<City>(INDIA_CITIES[0]);

  async function handleContact(rank: number) {
    if (!matchId) return;
    setContactState(s => ({ ...s, [rank]: 'sending' }));
    try {
      await apiClient.post(`/outreach/${matchId}/contact/${rank}`);
      setContactState(s => ({ ...s, [rank]: 'awaiting' }));
    } catch {
      setContactState(s => ({ ...s, [rank]: 'idle' }));
    }
  }

  async function handleConfirm(rank: number) {
    if (!matchId) return;
    setContactState(s => ({ ...s, [rank]: 'confirming' }));
    try {
      await apiClient.post(`/outreach/${matchId}/confirm/${rank}`);
      setContactState(s => ({ ...s, [rank]: 'confirmed' }));
      setConfirmedRank(rank);
    } catch {
      setContactState(s => ({ ...s, [rank]: 'awaiting' }));
    }
  }

  async function handleFind() {
    setLoading(true);
    setError('');
    setCandidates(null);
    try {
      const res = await createMatch({
        blood_group: BG_MAP[selectedBG],
        transfusion_date: date,
        patient_lat: city.lat,
        patient_lon: city.lng,
        quantity_required: units,
      });
      setCandidates(res.candidates);
      setMatchId(res.match_id);
      setScanned(res.total_pool_searched ?? res.total_scanned ?? 0);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Failed to find donors. Check backend connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="AI Blood Matching" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="flex items-center gap-sm mb-xl">
          <span className="material-symbols-outlined text-primary text-[32px] icon-fill">magic_button</span>
          <h2 className="text-headline-lg font-bold text-on-surface tracking-tight">AI Blood Matching</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg pb-xl">
          {/* Left: Form */}
          <div className="lg:col-span-5 flex flex-col gap-md">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg flex-1">
              <h3 className="text-headline-md font-bold text-on-surface mb-md pb-sm border-b border-outline-variant">New Match Request</h3>
              <div className="flex flex-col gap-md">
                {/* Blood group selector */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Required Blood Group</label>
                  <div className="grid grid-cols-4 gap-sm">
                    {BLOOD_GROUPS.map(bg => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setSelectedBG(bg)}
                        className={`py-sm rounded-lg border text-center text-label-md transition-colors ${
                          selectedBG === bg
                            ? 'border-2 border-primary bg-primary text-on-primary shadow-sm'
                            : 'border-outline-variant text-on-surface bg-surface-container-lowest hover:bg-surface-variant'
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Transfusion Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Units */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Units Required</label>
                  <div className="flex items-center gap-md">
                    <button
                      type="button"
                      onClick={() => setUnits(u => Math.max(1, u - 1))}
                      className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-secondary-container transition-colors"
                    >
                      <span className="material-symbols-outlined">remove</span>
                    </button>
                    <span className="text-headline-md text-on-surface w-8 text-center">{units}</span>
                    <button
                      type="button"
                      onClick={() => setUnits(u => Math.min(10, u + 1))}
                      className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-secondary-container transition-colors"
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                    <span className="text-body-md text-on-surface-variant ml-sm">unit(s)</span>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Hospital / Location</label>
                  <CityDropdown city={city} onChange={setCity} />
                  <div className="mt-sm h-48 rounded-lg border border-outline-variant overflow-hidden">
                    <MapContainer
                      center={[city.lat, city.lng]}
                      zoom={12}
                      scrollWheelZoom={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <MapFlyTo center={[city.lat, city.lng]} />
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={[city.lat, city.lng]} icon={GREEN_ICON}>
                        <Popup><strong>📍 {city.name}, {city.state}</strong><br />Patient / Hospital</Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>

                {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>}

                <button
                  onClick={handleFind}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-sm py-md rounded-xl bg-primary-container text-on-primary text-label-md font-bold hover:bg-primary transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin material-symbols-outlined">autorenew</span>
                      Scanning donors…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">search</span>
                      Find Matching Donors
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-7 flex flex-col">
            {loading && (
              <div className="flex flex-col items-center justify-center flex-1 gap-lg py-xl">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <span className="material-symbols-outlined text-primary text-[32px] absolute inset-0 flex items-center justify-center">water_drop</span>
                </div>
                <div className="text-center">
                  <p className="text-body-lg text-on-surface font-semibold">Scanning eligible donors…</p>
                  <p className="text-label-md text-on-surface-variant mt-xs">KAG engine running compatibility checks</p>
                </div>
              </div>
            )}

            {!loading && candidates === null && (
              <div className="flex flex-col items-center justify-center flex-1 gap-md py-xl text-on-surface-variant">
                <span className="material-symbols-outlined text-[64px] text-outline">person_search</span>
                <p className="text-body-lg">Configure a request and click Find to start.</p>
              </div>
            )}

            {!loading && candidates !== null && (
              <>
                {/* Donor map */}
                <DonorMap city={city} candidates={candidates} />

                <div className="flex justify-between items-end mb-md">
                  <div>
                    <div className="flex items-center gap-sm mb-xs">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                      </span>
                      <span className="text-label-md text-primary font-bold">Analysis Complete</span>
                    </div>
                    <h3 className="text-headline-md text-on-surface">Scanned {scanned.toLocaleString()} donors</h3>
                  </div>
                  <div className="flex items-center gap-xs text-on-surface-variant bg-surface-variant px-sm py-xs rounded-full">
                    <span className="material-symbols-outlined text-[16px]">filter_list</span>
                    <span className="text-label-sm">Filtered by Score</span>
                  </div>
                </div>

                <div className="flex flex-col gap-md">
                  {candidates.map((c, idx) => {
                    const state = contactState[c.rank] ?? 'idle';
                    const isConfirmed = state === 'confirmed';
                    const isAwaiting = state === 'awaiting';
                    const isSending = state === 'sending';
                    const isConfirming = state === 'confirming';
                    const otherConfirmed = confirmedRank !== null && confirmedRank !== c.rank;

                    return (
                    <div
                      key={c.user_id_hash_short}
                      className={`bg-surface-container-lowest rounded-xl border shadow-sm p-md relative overflow-hidden transition-all ${
                        isConfirmed ? 'border-2 border-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.15)]' :
                        idx === 0 ? 'border-2 border-primary shadow-[0_8px_16px_rgba(196,30,58,0.08)]' :
                        'border-outline-variant'
                      } ${otherConfirmed && !isConfirmed ? 'opacity-40' : ''}`}
                    >
                      {/* Badge */}
                      {isConfirmed ? (
                        <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] uppercase tracking-wider px-sm py-xs rounded-bl-lg font-bold flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[14px] icon-fill">check_circle</span>
                          Confirmed
                        </div>
                      ) : idx === 0 && !otherConfirmed ? (
                        <div className="absolute top-0 right-0 bg-primary text-on-primary text-[10px] uppercase tracking-wider px-sm py-xs rounded-bl-lg font-bold flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[14px] icon-fill">award_star</span>
                          Primary Candidate
                        </div>
                      ) : null}

                      <div className="flex justify-between items-start mt-sm">
                        <div className="flex items-center gap-md">
                          <div className="relative">
                            <div className={`${idx === 0 ? 'w-12 h-12' : 'w-10 h-10'} rounded-full flex items-center justify-center border ${isConfirmed ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-surface-variant border-outline-variant text-primary'}`}>
                              <span className="material-symbols-outlined">{isConfirmed ? 'how_to_reg' : 'person'}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-surface" style={{ background: c.tier === 'Tier1' ? '#1A0A0A' : c.tier === 'Tier2' ? '#9e0027' : '#8f6f6f' }}>
                              <span className="material-symbols-outlined text-[10px] icon-fill" style={{ color: c.tier === 'Tier1' ? '#fbbf24' : '#fff' }}>{tierIcon(c.tier)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-sm">
                              <h4 className="text-body-md font-bold text-on-surface">{c.user_id_hash_short.toUpperCase()}</h4>
                              <span className="px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant border border-outline-variant text-[10px] uppercase font-bold">{c.blood_group}</span>
                            </div>
                            <div className="flex items-center gap-sm text-on-surface-variant text-label-sm mt-xs">
                              <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[14px]">location_on</span>{(c.distance_km ?? 0).toFixed(1)} km</span>
                              <span>•</span>
                              <span>{c.donor_type}</span>
                              <span>•</span>
                              <span>{c.donations_till_date} donations</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${idx === 0 ? 'text-[28px] leading-none' : 'text-headline-md'} ${isConfirmed ? 'text-emerald-600' : tierColor(c.tier)}`}>
                            {c.score.toFixed(2)}
                          </div>
                          <div className="text-label-sm text-on-surface-variant">{c.tier}</div>
                        </div>
                      </div>

                      {/* AI explanation — primary card only */}
                      {idx === 0 && c.explanation && !otherConfirmed && (
                        <div className="mt-md bg-surface-variant rounded-lg p-sm border border-outline-variant flex items-start gap-sm">
                          <span className="material-symbols-outlined text-primary mt-xs text-[18px]">psychology</span>
                          <p className="text-label-md text-on-surface">{c.explanation}</p>
                        </div>
                      )}

                      {/* Outreach action row */}
                      {!otherConfirmed && (
                        <div className="mt-md pt-sm border-t border-outline-variant flex items-center gap-sm">
                          {state === 'idle' && (
                            <button
                              onClick={() => handleContact(c.rank)}
                              className="flex items-center gap-sm px-md py-[7px] rounded-xl text-white text-label-md font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all"
                              style={{ background: '#25D366' }}
                            >
                              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0 fill-white" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.528 5.847L.057 23.885l6.184-1.621A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.372l-.36-.213-3.67.962.98-3.585-.234-.369A9.818 9.818 0 1112 21.818z"/>
                              </svg>
                              WhatsApp Reach Out
                            </button>
                          )}
                          {isSending && (
                            <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              Sending WhatsApp…
                            </span>
                          )}
                          {isAwaiting && (
                            <>
                              <span className="flex items-center gap-xs text-label-md text-amber-600 font-medium">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                WhatsApp sent — awaiting response
                              </span>
                              <button
                                onClick={() => handleConfirm(c.rank)}
                                className="ml-auto flex items-center gap-xs px-md py-xs rounded-lg bg-emerald-600 text-white text-label-md font-bold hover:bg-emerald-700 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                Mark Confirmed
                              </button>
                            </>
                          )}
                          {isConfirming && (
                            <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              Confirming…
                            </span>
                          )}
                          {isConfirmed && (
                            <span className="flex items-center gap-xs text-label-md text-emerald-600 font-bold">
                              <span className="material-symbols-outlined text-[16px] icon-fill">check_circle</span>
                              Donor confirmed — outreach complete
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {matchId && (
                  <div className="mt-auto pt-md border-t border-outline-variant bg-background pb-sm">
                    <button
                      onClick={() => navigate(`/outreach/${matchId}`)}
                      className="w-full flex items-center justify-center gap-sm py-md rounded-lg border-2 border-primary text-primary hover:bg-surface-variant transition-colors text-body-md font-bold group"
                    >
                      <span className="material-symbols-outlined group-hover:animate-pulse">rocket_launch</span>
                      View Live Outreach
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
