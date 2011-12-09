// TODO RestartTimer statements

/* Main FSM file */

UniqueInstance = null;

var Conf      = require( './conf.js' );
var Network   = require( './fsm_networking' );
var State     = require( './state' );
var FSM_Event = require( './fsm_event' );

/* Static variables declarations */

/* Names of FSM states, to ease debugging */
FSM.prototype.STATES_NAMES =
{
  Idle        : "Idle",
  Connect     : "Connect",
  Active      : "Active",
  OpenSent    : "OpenSent",
  OpenConfirm : "OpenConfirm",
  Established : "Established"
};

/* Various events happening to the FSM.
 * Events are prefixed with their categories, where
 *  - TC = Transport Connection (something related to it happened)
 *  - TO = Time Out (a timer timed out)
 *  - M  = Message (a message was received)
 */
FSM.prototype.EVENTS_NAMES =
{
  BGP_Start               : "BGP_Start",
  BGP_Stop                : "BGP_Stop",
  BGP_TC_Open             : "BGP_TC_Open",
  BGP_TC_Closed           : "BGP_TC_Closed",
  BGP_TC_OpenFailed       : "BGP_TC_OpenFailed",
  BGP_TransportFatalError : "BGP_TransportFatalError",
  TO_ConnectRetry         : "TO_ConnectRetry",
  TO_Hold                 : "TO_Hold",
  TO_KeepAlive            : "TO_KeepAlive",
  M_Open_OK               : "M_Open_OK",
  M_Open_BAD              : "M_Open_BAD",
  M_KeepAlive             : "M_KeepAlive",
  M_Update_OK             : "M_Update_OK",
  M_Update_BAD            : "M_Update_BAD",
  M_Notification          : "M_Notification"
};

FSM.prototype.MESSAGE_TYPES =
{
  OPEN         : 1,
  UPDATE       : 2,
  NOTIFICATION : 3,
  KEEPALIVE    : 4
};

FSM.prototype.ERRCODES =
{
  HEADER_ERR : 1,
  OPEN_ERR   : 2,
  UPDATE_ERR : 3,
  HOLD_TO    : 4,
  FSM_ERR    : 5,
  CEASE      : 6
};

/* FSM's global variables (accessible by the states) */
VARIABLES =
{
  ConnectTimer       : null,
  HoldTimer          : null,
  KeepAliveTimer     : null,
  ConnectionToPeer   : "todo",
  ConnectionFromPeer : "todo"
};

FSM.prototype.holdTimerValue = 4 * 60000;

/* Functions' definitions */

function FSM()
{
  if( UniqueInstance === null )
  {
    UniqueInstance = this;
    exports.UniqueInstance = UniqueInstance;

    // create FSM's states
    var Idle        = new State.State( this.STATES_NAMES.Idle );
    var Connect     = new State.State( this.STATES_NAMES.Connect );
    var Active      = new State.State( this.STATES_NAMES.Active );
    var OpenSent    = new State.State( this.STATES_NAMES.OpenSent );
    var OpenConfirm = new State.State( this.STATES_NAMES.OpenConfirm );
    var Established = new State.State( this.STATES_NAMES.Established );

    // Link the states together with events and transitions
    // TODO : default behavior (consisting of returning to Idle and releasing
    // everything + send NOTIFICATION for OpenSent/Confirm and Established
    // states)

    // IDLE
    Idle.Connect( Connect, this.EVENTS_NAMES.BGP_Start, function( evt ){
      VARIABLES.ConnectTimer = setTimeout( ConnectRetryTimeOut,
                                           Conf.connectRetryTO );

      Network.StartSocket( Conf.port, Conf.host, UniqueInstance );
      Network.StartServer( Conf.port, Conf.listenHost, UniqueInstance );
    } );

    // CONNECT
    Connect.Connect( Connect, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Connect.Connect( OpenSent, this.EVENTS_NAMES.BGP_TC_Open, function( evt ){
      clearTimeout( VARIABLES.ConnectTimer );

      // TODO Complete initialization -> ??
      VARIABLES.HoldTimer = setTimeout( HoldTimeOut, UniqueInstance.holdTimerValue );

      Network.SendOpenMessage();
    } );

    Connect.Connect( Active, this.EVENTS_NAMES.BGP_TC_OpenFailed, function( evt ){
      RestartTimer( VARIABLES.ConnectTimer );
    } );

    Connect.Connect( Connect, this.EVENTS_NAMES.TO_ConnectRetry, function( evt ){
      RestartTimer( VARIABLES.ConnectTimer );

      Network.StopSocket();
      Network.StartSocket();
    } );

    // ACTIVE
    Active.Connect( Active, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Active.Connect( OpenSent, this.EVENTS_NAMES.BGP_TC_Open, function( evt ){
      clearTimeout( VARIABLES.ConnectTimer );

      // TODO Complete initialization -> ?? 
      VARIABLES.HoldTimer = setTimeout( HoldTimeOut, UniqueInstance.holdTimerValue );

      Network.SendOpenMessage();
    } );

    Active.Connect( Active, this.EVENTS_NAMES.BGP_TC_OpenFailed, function( evt ){
      Network.StopServer();
      Network.StartServer();

      RestartTimer( VARIABLES.ConnectTimer );
    } );

    Active.Connect( Connect, this.EVENTS_NAMES.TO_ConnectRetry, function( evt ){
      VARIABLES.ConnectTimer = setTimeout( ConnectRetryTimeOut, Conf.connectRetryTO );

      Network.StopSocket();
      Network.StartSocket();
    } );

    // OPEN SENT
    OpenSent.Connect( OpenSent, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    OpenSent.Connect( Active, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      Network.StopSocket();
      VARIABLES.ConnectTimer = setTimeout( ConnectRetryTimeOut,
                                           Conf.connectRetryTO );
    } );

    OpenSent.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      CloseConnection();
    } );

    OpenSent.Connect( OpenConfirm, this.EVENTS_NAMES.M_Open_OK, function( evt ){
      VARIABLES.KeepAliveTimer = setTimeout( KeepAliveTimeOut,
                                             Conf.keepAliveTO );

      // restart Hold Timer with its new timeout value
      clearTimeout( VARIABLES.HoldTimer );
      VARIABLES.HoldTimer = setTimeout( HoldTimeOut,
                                        UniqueInstance.holdTimerValue );

      Network.SendKeepAliveMessage();
    } );

    OpenSent.Connect( Idle, this.EVENTS_NAMES.M_Open_BAD, function( evt ){
      SendNotificationMessage( FSM.prototype.ERRCODES.OPEN_ERR, evt.error );
      ReleaseResources();
    } );

    // OPEN CONFIRM
    OpenConfirm.Connect( OpenConfirm, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      ReleaseResources();
    } );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      ReleaseResources();
    } );

    OpenConfirm.Connect( OpenConfirm, this.EVENTS_NAMES.TO_KeepAlive, function( evt ){
      VARIABLES.KeepAliveTimer = setTimeout( KeepAliveTimeOut, Conf.keepAliveTO );
      SendKeepAliveMessage();
    } );

    OpenConfirm.Connect( Established, this.EVENTS_NAMES.M_KeepAlive, function( evt ){
      // complete initialization -> ??
      RestartTimer( VARIABLES.HoldTimer );
    } );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.M_Notification, function( evt ){
      CloseConnection();
      ReleaseResources();
    } );

    // ESTABLISHED
    Established.Connect( Established, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Established.Connect( Idle, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      ReleaseResources();
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      ReleaseResources();
    } );

    Established.Connect( Established, this.EVENTS_NAMES.TO_KeepAlive, function( evt ){
      VARIABLES.KeepAliveTimer = setTimeout( KeepAliveTimeOut, Conf.keepAliveTO );
      Network.SendKeepAliveMessage();
    } );

    Established.Connect( Established, this.EVENTS_NAMES.M_KeepAlive, function( evt ){
      RestartTimer( VARIABLES.HoldTimer );
      Network.SendKeepAliveMessage();
    } );

    Established.Connect( Established, this.EVENTS_NAMES.M_Update_OK, function( evt ){
      //
      SendUpdateMessage();
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Update_BAD, function( evt ){
      SendNotificationMessage( FSM.prototype.ERRCODES.UPDATE_ERR, evt.error );

      CloseConnection();

      ReleaseResources();
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Notification, function( evt ){
      SendNotificationMessage( FSM.prototype.ERRCODES.CEASE, 0 );

      CloseConnection();

      ReleaseResources();
    } );

    // init current state variable
    this.currentState = Idle;

    // at the end of the scope, the states should not be deleted, since each
    // state keeps references on some other states.

    // Init FSM global variables / objects
    
  }
}

/* FSM's event handler */
FSM.prototype.Handle = function( evt )
{
  console.log( "Received event of type " + evt.type + " in state " + this.currentState.name );
  this.currentState = this.currentState.Handle( evt );
  console.log( "Next state : " + this.currentState.name );
};

/* Start the fsm */
FSM.prototype.Start = function()
{
  console.log( "Starting FSM." );

  var evt = new FSM_Event.FSM_Event( this.EVENTS_NAMES.BGP_Start);

  this.Handle( evt );
};

FSM.prototype.Stop = function()
{
  console.log( "Stopping FSM." );
  this.Handle( new FSM_Event.FSM_Event( this.EVENTS_NAMES.BGP_Stop ) );
};

ConnectRetryTimeOut = function()
{
  UniqueInstance.Handle( 
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_ConnectRetry ) );
};

HoldTimeOut = function()
{
  UniqueInstance.Handle(
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_Hold ) );
};

KeepAliveTimeOut = function()
{
  UniqueInstance.Handle(
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_KeepAlive ) );
};

ProcessOpenMsg = function( msg )
{
  console.log( msg );

  // TODO extract relevant information from message : peer AS number, hold
  // time, peer BGP identifier. Also take care of opt parameters.

  // set Hold timer value to the new time
  UniqueInstance.holdTimerValue = msg.HoldValue;

  // TODO
  // Ultimately spin back M_Open_Ok or M_Open_BAD
};

ProcessUpdateMsg = function( msg )
{
  console.log( msg );

  // TODO
  // Ultimately spin back M_Update_OK or M_Update_BAD
};

// This function reset a timer currently running. It wont do anything if the
// timer has already expired.
RestartTimer = function( timerId )
{
  if( timerId !== null )
  {
    //var timeout  = timerId._idleTimeout;
    //var callback = timerId._onTimeout;

    //clearTimeout( timerId );

    //timerId = setTimeout( callback, timeout );

    timerId._idleStart = new Date();
  }
};

// Close the transport connection to the peer
CloseConnection = function()
{
  Network.StopSocket();
  Network.StopServer();
};

ReleaseResources = function()
{
  // Stop timers
  clearTimeout( VARIABLES.ConnectTimer );
  clearTimeout( VARIABLES.HoldTimer );
  clearTimeout( VARIABLES.KeepAliveTimer );

  // what else ?
};

exports.TestTimer = function()
{
  console.time( "toto" );

  VARIABLES.ConnectTimer = setTimeout( function(){
    console.log( "plop" ); 
    console.timeEnd( "toto" );
    console.time( "toto" );
  }, 5000 ); 

  setTimeout( RestartTimer, 4500, VARIABLES.ConnectTimer );
};

exports.FSM = FSM;
