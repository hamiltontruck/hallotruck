import type { RealtimeChannel } from "@supabase/supabase-js";
import { customerSupabase } from "./auth/customer-supabase";

export type CustomerDriverChatMessage={id:string;thread_id:string;sender_id:string;body:string;client_message_id:string;created_at:string};

async function requireCustomer(userId:string){
  if(!customerSupabase) throw new Error("Customer Supabase is not configured.");
  const {data,error}=await customerSupabase.auth.getUser();
  if(error||!data.user||data.user.id!==userId) throw new Error("Customer session expired.");
  return customerSupabase;
}
export async function openCustomerDriverChat(userId:string,orderId:string){
  const client=await requireCustomer(userId);
  const {data,error}=await client.rpc("open_customer_driver_order_chat",{p_order_id:orderId});
  if(error||!data) throw new Error(error?.message||"Order chat could not be opened.");
  return String(data);
}
export async function loadCustomerDriverChatMessages(userId:string,threadId:string){
  const client=await requireCustomer(userId);
  const {data,error}=await client.from("customer_driver_chat_messages").select("id,thread_id,sender_id,body,client_message_id,created_at").eq("thread_id",threadId).order("created_at",{ascending:true}).limit(300);
  if(error) throw new Error(error.message); return (data??[]) as CustomerDriverChatMessage[];
}
export async function sendCustomerDriverChatMessage(userId:string,threadId:string,body:string){
  const client=await requireCustomer(userId); const text=body.trim(); if(!text)return;
  const {error}=await client.rpc("send_customer_driver_chat_message",{p_thread_id:threadId,p_body:text,p_client_message_id:crypto.randomUUID()});
  if(error) throw new Error(error.message);
}
export async function markCustomerDriverChatRead(userId:string,threadId:string){
  const client=await requireCustomer(userId); const {error}=await client.rpc("mark_customer_driver_chat_read",{p_thread_id:threadId}); if(error)throw new Error(error.message);
}
export async function watchCustomerDriverChat(userId:string,threadId:string,onChange:()=>void):Promise<()=>void>{
  const client=await requireCustomer(userId);
  const channel:RealtimeChannel=client.channel(`customer-mobile-driver-chat:${threadId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"customer_driver_chat_messages",filter:`thread_id=eq.${threadId}`},onChange).on("postgres_changes",{event:"UPDATE",schema:"public",table:"customer_driver_chat_threads",filter:`id=eq.${threadId}`},onChange).subscribe();
  return ()=>{void client.removeChannel(channel)};
}
