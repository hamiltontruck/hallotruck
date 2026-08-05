import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";

const links = [
  { to: "/driver/jobs", label: "Jobs", icon: "▦" },
  { to: "/driver/trip", label: "Trip", icon: "⌁" },
  { to: "/driver/documents", label: "Docs", icon: "▤" },
  { to: "/driver/earnings", label: "Earnings", icon: "◫" },
];

export function Header() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [driverName, setDriverName] = useState("Driver");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      setDriverName(profile?.full_name || data.user.email?.split("@")[0] || "Driver");
    });
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate("/driver/login", { replace: true });
  }

  return <>
    <header className="sticky top-0 z-30 bg-asphalt text-white border-b border-white/10">
      <div className="max-w-5xl mx-auto h-20 px-4 sm:px-6 flex items-center justify-between">
        <button onClick={() => navigate("/driver/jobs")} className="text-left">
          <div className="font-display font-bold text-xl tracking-tight">HALLO<span className="text-amber">TRUCK</span></div>
          <div className="font-mono text-[8px] tracking-[.25em] text-white/40 mt-1">DRIVER WORKSPACE</div>
        </button>
        <nav className="hidden md:flex items-center gap-7">
          {links.map(link => <NavLink key={link.to} to={link.to} className={({isActive})=>`text-sm ${isActive?"text-amber font-semibold":"text-white/55 hover:text-white"}`}>{link.label}</NavLink>)}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right"><p className="text-xs font-semibold max-w-36 truncate">{driverName}</p><p className="text-[10px] text-emerald-400 mt-0.5">● Online</p></div>
          <button onClick={()=>setMenuOpen(v=>!v)} className="w-11 h-11 border border-white/15 grid place-items-center" aria-label="Open driver menu"><span className="text-xl">{menuOpen?"×":"☰"}</span></button>
        </div>
      </div>
      {menuOpen&&<div className="absolute right-4 top-[72px] w-64 bg-white text-asphalt shadow-xl border border-asphalt/10 p-3"><p className="px-3 py-2 text-xs text-steel">Signed in as <b className="text-asphalt">{driverName}</b></p>{links.map(link=><NavLink key={link.to} to={link.to} onClick={()=>setMenuOpen(false)} className="block px-3 py-3 text-sm hover:bg-[#f5f3ed]">{link.label}</NavLink>)}<button onClick={logout} className="w-full text-left px-3 py-3 text-sm text-route border-t border-asphalt/10 mt-2">Sign out</button></div>}
      <div className="h-1 bg-route-dash"/>
    </header>
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-asphalt/10 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
      {links.map(link=><NavLink key={link.to} to={link.to} className={({isActive})=>`py-3 flex flex-col items-center gap-1 text-[10px] ${isActive?"text-asphalt font-semibold":"text-steel"}`}><span className="text-lg leading-none">{link.icon}</span>{link.label}</NavLink>)}
    </nav>
  </>;
}
