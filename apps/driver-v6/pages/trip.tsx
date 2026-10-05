import { Link } from 'react-router-dom';
import { ArrowLeft, MapPinOff, ShieldAlert } from 'lucide-react';
import { Button } from '../components/Button';
import styles from './trip.module.css';
export default function TripPage(){return <main className={styles.shell}><header className={styles.header}><span>HALLO DRIVER · V6</span><h1>Trip</h1><p>GPS remains off until HALLO confirms an approved driver and active assignment.</p></header><section className={styles.empty} role="status"><ShieldAlert aria-hidden="true"/><h2>No active trip confirmed</h2><p>Sign in and wait for HALLO to load your active assignment. This screen will not request location or display a map before a trip is confirmed.</p><div className={styles.actions}><Button asChild variant="outline"><Link to="/jobs"><ArrowLeft aria-hidden="true"/> Back to jobs</Link></Button><MapPinOff aria-label="GPS off" className={styles.gpsOff}/></div></section></main>}
