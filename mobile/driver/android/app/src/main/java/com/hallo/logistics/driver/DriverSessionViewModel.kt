package com.hallo.logistics.driver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DriverSessionViewModel(private val repo:DriverRepository=DriverRepository()):ViewModel(){
 private val _state=MutableStateFlow(DriverUiState());val state=_state.asStateFlow();init{restore()}
 private fun work(message:String="Working…",block:suspend()->Unit)=viewModelScope.launch{_state.value=_state.value.copy(busy=true,message=message);runCatching{block()}.onFailure{_state.value=_state.value.copy(busy=false,loading=false,message=it.message?:"Request failed")}}
 fun restore()=work("Restoring Driver session…"){if(!HalloSupabase.configured){_state.value=DriverUiState(false,message="Configure the existing HALLO Supabase project");return@work};if(repo.userId()==null){_state.value=DriverUiState(false,message="Sign in or create a Driver account");return@work};load()}
 fun signIn(email:String,pin:String)=work("Signing in…"){repo.signIn(email,pin);load()}
 fun signUp(name:String,phone:String,email:String,pin:String,confirm:String)=work("Creating Driver account…"){require(pin==confirm){"PIN confirmation does not match"};repo.signUp(name,phone,email,pin);if(repo.userId()!=null)load()else _state.value=DriverUiState(false,message="Confirm your email, then sign in")}
 fun signOut()=work{repo.signOut();_state.value=DriverUiState(false,message="Signed out")}
 fun page(page:DriverPage){_state.value=_state.value.copy(page=page)}
 fun refresh()=work("Refreshing…"){load()}
 private suspend fun load(){val p=repo.profile();val access=DriverAccessPolicy.resolve(p.role,p.driverStatus);if(access==DriverAccess.FORBIDDEN){repo.signOut();_state.value=DriverUiState(false,message="Driver access denied");return};val trucks=viewModelScope.async{repo.driverTrucks()};val docs=viewModelScope.async{repo.documents()};val notes=viewModelScope.async{repo.notifications()};val active=if(access==DriverAccess.APPROVED)repo.activeTrip()else null;val jobs=if(access==DriverAccess.APPROVED&&active==null)repo.jobs()else emptyList();val wallet=if(access==DriverAccess.APPROVED)runCatching{repo.wallet()}.getOrNull()else null;_state.value=DriverUiState(false,false,access,if(access==DriverAccess.APPROVED)DriverPage.HOME else DriverPage.ONBOARDING,"Driver data is current",p,jobs,active,trucks.await(),docs.await(),notes.await(),wallet)}
 fun claim(orderId:String,truckId:String)=work("Accepting job…"){repo.claim(orderId,truckId);load()}
 fun openTrip(){requireNotNull(_state.value.activeTrip);_state.value=_state.value.copy(page=DriverPage.TRIP,message="Start authorized GPS to begin the trip")}
 fun saveVehicle(plate:String,type:String,capacity:Double)=work("Saving vehicle…"){repo.saveVehicle(plate,type,capacity);load()}
 fun uploadDocument(key:String,truckId:String?,name:String,mime:String,bytes:ByteArray)=work("Uploading document…"){repo.uploadDocument(key,truckId,name,mime,bytes);load()}
 fun finish(recipient:String,note:String,photo:ByteArray,photoMime:String,signature:ByteArray,result:String,amount:Double?)=work("Submitting proof and completing trip…"){val trip=requireNotNull(_state.value.activeTrip);require(trip.status=="in_transit"){"Start the trip before delivery"};require(recipient.trim().length>=2){"Enter receiver name"};val photoPath=repo.uploadDeliveryAsset(trip.id,"delivery",photoMime,photo);val signaturePath=repo.uploadDeliveryAsset(trip.id,"signature","image/png",signature);repo.finishTrip(trip.id,recipient,note,photoPath,signaturePath,result,amount);load();_state.value=_state.value.copy(page=DriverPage.HOME,message="Trip completed")}
 fun markRead(id:String)=work{repo.markRead(id);load()}
}
