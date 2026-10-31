import { useEffect, useState } from 'react';
import { configService } from '../services/authService';

let cache = null;
let pending = null;

/** Hospital name/address from the backend configuration (cached for the session). */
export function useHospital() {
  const [config, setConfig] = useState(cache);
  useEffect(() => {
    if (cache) return;
    pending = pending || configService.get().then((c) => (cache = c));
    pending.then(setConfig).catch(() => {});
  }, []);
  return config || { hospital_name: 'Government District Hospital', hospital_address: '', hospital_phone: '' };
}
