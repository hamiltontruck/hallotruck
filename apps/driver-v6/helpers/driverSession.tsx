export type DriverProfile = { id:string; role:string|null; driver_status:string|null; is_active:boolean|null };
export type DriverAccessState = 'signed-out'|'not-approved'|'approved';
export function evaluateDriverAccess(user:{id:string}|null, profile:DriverProfile|null):DriverAccessState { if(!user)return 'signed-out'; if(!profile)return 'not-approved'; const approved=profile.id===user.id&&profile.role==='driver'&&profile.driver_status==='approved'&&profile.is_active===true; return approved?'approved':'not-approved'; }
