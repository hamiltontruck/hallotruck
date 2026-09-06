import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { Login } from "./auth";
import { DriverAccess } from "./onboarding";
import { supabase } from "./supabase";
import { DriverWorkspace } from "./App";
import "./tailwind.css";
import "./driver-v4.css";
import "./styles.css";
import "./onboarding.css";
function Root(){const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);useEffect(()=>{let active=true;void supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setLoading(false)}});const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>{active=false;data.subscription.unsubscribe()}},[]);if(loading)return <div className="splash"><span className="mark big">H</span><b>HALLO DRIVER</b><small>Smart Logistics V4</small></div>;if(!session)return <Login/>;return <DriverAccess session={session}><DriverWorkspace userId={session.user.id}/></DriverAccess>}
createRoot(document.getElementById("root")!).render(<StrictMode><Root/></StrictMode>);
