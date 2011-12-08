/* Main FSM file */

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

/* FSM's global variables (accessible by the states) */
FSM.prototype.VARIABLES =
{
  ConnectTimer       : null,
  HoldTimer          : null,
  KeepAliveTimer     : null,
  ConnectionToPeer   : "todo",
  ConnectionFromPeer : "todo"
};

FSM.prototype.holdTimerValue = 4 * 60000;

FSM.prototype.UniqueInstance = null;

/* Functions' definitions */

function FSM()
{
  if( this.UniqueInstance === null )
  {
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
      FSM.prototype.ConnectTimer = setTimeout( FSM.prototype.ConnectRetryTimeOut,
                                               Conf.connectRetryTO );

      Network.StartSocket( Conf.port, Conf.host, FSM.prototype.UniqueInstance );
      Network.StartServer( Conf.port, Conf.listenHost, FSM.prototype.UniqueInstance );
    } );

    // CONNECT
    Connect.Connect( Connect, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Connect.Connect( OpenSent, this.EVENTS_NAMES.BGP_TC_Open, function( evt ){
      clearTimeout( FSM.prototype.ConnectTimer );

      // TODO Complete initialization -> ?? set hold

      Network.SendOpenMessage();
    } );

    Connect.Connect( Active, this.EVENTS_NAMES.BGP_TC_OpenFailed, function( evt ){
      RestartTimer( FSM.prototype.ConnectTimer );
    } );

    Connect.Connect( Connect, this.EVENTS_NAMES.TO_ConnectRetry, function( evt ){
      RestartTimer( FSM.prototype.ConnectTimer );

      Network.StopSocket();
      Network.StartSocket();
    } );

    // ACTIVE
    Active.Connect( Active, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Active.Connect( OpenSent, this.EVENTS_NAMES.BGP_TC_Open, function( evt ){
      clearTimeout( FSM.prototype.ConnectTimer );

      // TODO Complete initialization -> ?? set hold

      Network.SendOpenMessage();
    } );

    Active.Connect( Active, this.EVENTS_NAMES.BGP_TC_OpenFailed, function( evt ){
      Network.StopServer();
      Network.StartServer();

      RestartTimer( FSM.prototype.ConnectTimer );
    } );

    Active.Connect( Connect, this.EVENTS_NAMES.TO_ConnectRetry, function( evt ){
      RestartTimer( FSM.prototype.ConnectTimer );

      Network.StopSocket();
      Network.StartSocket();
    } );

    // OPEN SENT
    OpenSent.Connect( OpenSent, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    OpenSent.Connect( Active, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      Network.StopSocket();
      FSM.prototype.ConnectTimer = setTimeout( FSM.prototype.ConnectRetryTimeOut,
                                               Conf.connectRetryTO );
    } );

    OpenSent.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      Network.StopSocket();
      Network.StopServer();
    } );

    OpenSent.Connect( OpenConfirm, this.EVENTS_NAMES.M_Open_OK, function( evt ){
      // send KEEP_ALIVE
    } );

    OpenSent.Connect( Idle, this.EVENTS_NAMES.M_Open_BAD, function( evt ){
      // release resources
      // send NOTIFICATION
    } );

    // OPEN CONFIRM
    OpenConfirm.Connect( OpenConfirm, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      // release resources
    } );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      // release resources
    } );

    OpenConfirm.Connect( OpenConfirm, this.EVENTS_NAMES.TO_KeepAlive, function( evt ){
      // restart KeepAlive timer
      // send KEEP_ALIVE
    } );

    OpenConfirm.Connect( Established, this.EVENTS_NAMES.M_KeepAlive, function( evt ){
      // complete initialization -> ??
      RestartTimer( FSM.prototype.HoldTimer );
    } );

    OpenConfirm.Connect( Idle, this.EVENTS_NAMES.M_Notification, function( evt ){
      // close connection
      // release resource
    } );

    // ESTABLISHED
    Established.Connect( Established, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Established.Connect( Idle, this.EVENTS_NAMES.BGP_TC_Closed, function( evt ){
      // release resources
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.BGP_TransportFatalError, function( evt ){
      // release resources
    } );

    Established.Connect( Established, this.EVENTS_NAMES.TO_KeepAlive, function( evt ){
      // Restart KeepAlive timer
      // Send KEEP_ALIVE
    } );

    Established.Connect( Established, this.EVENTS_NAMES.M_KeepAlive, function( evt ){
      // Restart Hold timer
      // Send KEEP_ALIVE
    } );

    Established.Connect( Established, this.EVENTS_NAMES.M_Update_OK, function( evt ){
      // process update msg
      // send UPDATE
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Update_BAD, function( evt ){
      // send NOTIFICATION
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Notification, function( evt ){
      // close transport connection
      // release resources
      // send NOTIFICATION
    } );

    // init current state variable
    this.currentState = Idle;

    // at the end of the scope, the states should not be deleted, since each
    // state keeps references on some other states.

    // Init FSM global variables / objects
    
    exports.UniqueInstance = this;
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

FSM.prototype.ConnectRetryTimeOut = function()
{
  exports.UniqueInstance.Handle( 
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_ConnectRetry ) );
};

RestartTimer = function( timerId )
{
  if( timerId !== null )
  {
    var timeout  = timerId._idleTimeout;
    var callback = timerId._onTimeout;

    clearTimeout( timerId );

    FSM.prototype.ConnectTimer = setTimeout( callback, timeout );
  }
};

FSM.prototype.HoldTimeOut = function()
{
  FSM.UniqueInstance.Handle(
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_Hold ) );
};

FSM.prototype.KeepAliveTimeOut = function()
{
  FSM.prototype.UniqueInstance.Handle(
    new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.TO_KeepAlive ) );
};

exports.FSM = FSM;
