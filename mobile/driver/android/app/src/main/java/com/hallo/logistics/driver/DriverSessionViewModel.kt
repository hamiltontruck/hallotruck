package com.hallo.logistics.driver

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DriverSessionViewModel(private val repo:DriverRepository=DriverRepository()):ViewModel(){
    private var syncJob:Job?=null
    private var liveTripJob:Job?=null
    private val _state=MutableStateFlow(DriverUiState())
    val state=_state.asStateFlow()

    init{restore()}

    private fun work(message:DriverMessage,block:suspend()->Unit)=viewModelScope.launch{
        _state.value=_state.value.copy(busy=true,messageKey=message,errorCode=null)
        runCatching{block()}.onFailure{
            _state.value=_state.value.copy(busy=false,loading=false,errorCode=DriverErrorPolicy.code(it))
        }
    }

    fun restore()=work(DriverMessage.RESTORING){
        if(!HalloSupabase.configured){_state.value=DriverUiState(false,messageKey=DriverMessage.CONFIG_REQUIRED);return@work}
        if(repo.userId()==null){_state.value=DriverUiState(false,messageKey=DriverMessage.SIGN_IN_REQUIRED);return@work}
        load()
    }
    fun signIn(email:String,pin:String)=work(DriverMessage.SIGNING_IN){repo.signIn(email,pin);load()}
    fun signUp(name:String,phone:String,email:String,pin:String,confirm:String)=work(DriverMessage.CREATING_ACCOUNT){
        require(pin==confirm);repo.signUp(name,phone,email,pin)
        if(repo.userId()!=null)load() else _state.value=DriverUiState(false,messageKey=DriverMessage.CONFIRM_EMAIL)
    }
    fun signOut()=work(DriverMessage.SIGNED_OUT){syncJob?.cancel();liveTripJob?.cancel();repo.signOut();_state.value=DriverUiState(false,messageKey=DriverMessage.SIGNED_OUT)}
    fun page(page:DriverPage){_state.value=_state.value.copy(page=page)}
    fun refresh()=work(DriverMessage.REFRESHING){load()}

    private suspend fun load(){
        val previous=_state.value
        val p=repo.profile()
        val access=DriverAccessPolicy.resolve(p.role,p.driverStatus)
        if(access==DriverAccess.FORBIDDEN){repo.signOut();_state.value=DriverUiState(false,messageKey=DriverMessage.ACCESS_DENIED,access=DriverAccess.FORBIDDEN);return}

        val trucksCall=viewModelScope.async{runCatching{repo.driverTrucks()}}
        val docsCall=viewModelScope.async{runCatching{repo.documents()}}
        val notesCall=viewModelScope.async{runCatching{repo.notifications()}}
        val activeResult=if(access==DriverAccess.APPROVED)runCatching{repo.activeTrip()} else Result.success<DriverJob?>(null)
        val financialCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.wallet()}}else null
        val commissionCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.commissionSummary()}}else null
        val resultsCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.tripPaymentResults()}}else null
        val paymentsCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.commissionPayments()}}else null
        val depositsCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.depositTransactions()}}else null
        val historyCall=if(access==DriverAccess.APPROVED)viewModelScope.async{runCatching{repo.completedTrips()}}else null

        val trucksResult=trucksCall.await()
        val docsResult=docsCall.await()
        val notesResult=notesCall.await()
        val financialResult=financialCall?.await()
        val commissionResult=commissionCall?.await()
        val resultsResult=resultsCall?.await()
        val paymentsResult=paymentsCall?.await()
        val depositsResult=depositsCall?.await()
        val historyResult=historyCall?.await()

        val wallet=financialResult?.getOrNull()
        val commission=commissionResult?.getOrNull()
        val active=activeResult.getOrNull()
        val financeKnown=wallet!=null||commission!=null
        val blocked=if(financeKnown)DriverFinancePresentationPolicy.blocked(commission,wallet) else false

        val jobsResult=when{
            access!=DriverAccess.APPROVED->null
            activeResult.isFailure->Result.failure(IllegalStateException("active trip unavailable"))
            active!=null||blocked->Result.success(emptyList())
            !financeKnown->Result.failure(IllegalStateException("commission state unavailable"))
            else->runCatching{repo.jobs()}
        }

        _state.value=DriverUiState(
            loading=false,
            busy=false,
            access=access,
            page=if(access==DriverAccess.APPROVED)previous.page else DriverPage.ONBOARDING,
            messageKey=DriverMessage.CURRENT,
            profile=p,
            jobs=jobsResult?.getOrElse{emptyList()}?:emptyList(),
            jobsAvailable=jobsResult?.isSuccess==true,
            activeTrip=active,
            activeTripAvailable=access!=DriverAccess.APPROVED||activeResult.isSuccess,
            trucks=trucksResult.getOrElse{emptyList()},
            trucksAvailable=trucksResult.isSuccess,
            documents=docsResult.getOrElse{emptyList()},
            documentsAvailable=docsResult.isSuccess,
            notifications=notesResult.getOrElse{emptyList()},
            wallet=wallet,
            commission=commission,
            tripResults=resultsResult?.getOrElse{emptyList()}?:emptyList(),
            tripResultsAvailable=resultsResult?.isSuccess==true,
            commissionPayments=paymentsResult?.getOrElse{emptyList()}?:emptyList(),
            commissionPaymentsAvailable=paymentsResult?.isSuccess==true,
            depositTransactions=depositsResult?.getOrElse{emptyList()}?:emptyList(),
            depositTransactionsAvailable=depositsResult?.isSuccess==true,
            completedTrips=historyResult?.getOrElse{emptyList()}?:emptyList(),
            completedTripsAvailable=historyResult?.isSuccess==true,
            liveTrip=if(active!=null)previous.liveTrip?.takeIf{it.orderId==active.id}else null,
        )
        if(access==DriverAccess.APPROVED)startScopedSync() else {syncJob?.cancel();liveTripJob?.cancel()}
        active?.let{observeLiveTrip(it.id)}
    }

    private fun startScopedSync(){
        if(syncJob?.isActive==true)return
        syncJob=viewModelScope.launch{
            while(true){
                delay(12_000)
                val current=_state.value
                if(current.access!=DriverAccess.APPROVED)continue
                runCatching{repo.activeTrip()}.onSuccess{active->
                    if(active?.id!=current.activeTrip?.id||active?.status!=current.activeTrip?.status){
                        load()
                    }else if(!current.activeTripAvailable){
                        _state.value=current.copy(activeTripAvailable=true)
                    }
                }.onFailure{
                    liveTripJob?.cancel()
                    _state.value=_state.value.copy(activeTrip=null,activeTripAvailable=false,liveTrip=null,jobsAvailable=false)
                }
            }
        }
    }

    private fun observeLiveTrip(orderId:String){
        if(liveTripJob?.isActive==true&&_state.value.liveTrip?.orderId==orderId)return
        liveTripJob?.cancel();liveTripJob=viewModelScope.launch{
            while(true){
                runCatching{repo.liveTrip(orderId)}.onSuccess{_state.value=_state.value.copy(liveTrip=it)}
                delay(10_000)
            }
        }
    }

    fun claim(orderId:String,truckId:String)=work(DriverMessage.ACCEPTING_JOB){repo.claim(orderId,truckId);load()}
    fun openTrip(){requireNotNull(_state.value.activeTrip);_state.value=_state.value.copy(page=DriverPage.TRIP,messageKey=DriverMessage.OPEN_TRIP,errorCode=null)}
    fun saveVehicle(plate:String,type:String,capacity:Double)=work(DriverMessage.SAVING_VEHICLE){repo.saveVehicle(plate,type,capacity);load()}
    fun uploadDocument(key:String,truckId:String?,name:String,mime:String,bytes:ByteArray,expiryDate:String?=null)=work(DriverMessage.UPLOADING_DOCUMENT){repo.uploadDocument(key,truckId,name,mime,bytes,expiryDate);load()}
    fun finish(recipient:String,note:String,photo:ByteArray,photoMime:String,signature:ByteArray,result:String,amount:Double?)=work(DriverMessage.SUBMITTING_DELIVERY){
        val trip=requireNotNull(_state.value.activeTrip);DriverDeliveryPolicy.validate(trip.status,trip.paymentMethod,result,trip.priceEtb,amount)
        require(recipient.trim().length>=2);require(photo.isNotEmpty()&&signature.isNotEmpty())
        val photoPath=repo.uploadDeliveryAsset(trip.id,"delivery",photoMime,photo);val signaturePath=repo.uploadDeliveryAsset(trip.id,"signature","image/png",signature)
        repo.finishTrip(trip.id,recipient,note,photoPath,signaturePath,result,amount);load();_state.value=_state.value.copy(page=DriverPage.WALLET,messageKey=DriverMessage.TRIP_COMPLETED)
    }
    fun markRead(id:String)=work(DriverMessage.MARKING_READ){repo.markRead(id);load()}

    override fun onCleared(){syncJob?.cancel();liveTripJob?.cancel();super.onCleared()}
}
