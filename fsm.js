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
  KeepAliveTimer     : null
};

FSM.prototype.AS_Number      =  65000;
FSM.prototype.BGP_Version    = 4;
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

    DefaultBehavior = function()
    {
      var _Idle = Idle;

      CloseConnection();
      ReleaseResources();

      return _Idle;
    };

    // IDLE
    Idle.Connect( Connect, this.EVENTS_NAMES.BGP_Start, function( evt ){

      VARIABLES.ConnectTimer = setTimeout( ConnectRetryTimeOut,
                                           Conf.connectRetryTO );

      Network.StartSocket( Conf.port, Conf.peerHost, UniqueInstance );
      Network.StartServer( Conf.port, Conf.thisHost, UniqueInstance );
    } );

    // CONNECT
    Connect.Connect( Connect, this.EVENTS_NAMES.BGP_Start, function( evt ){} );

    Connect.Connect( OpenSent, this.EVENTS_NAMES.BGP_TC_Open, function( evt ){
      clearTimeout( VARIABLES.ConnectTimer );

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
      Network.SendNotificationMessage( FSM.prototype.ERRCODES.OPEN_ERR, evt.error );
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
      Network.SendKeepAliveMessage();
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
    } );

    Established.Connect( Established, this.EVENTS_NAMES.M_Update_OK, function( evt ){
      //
      Networtk.SendUpdateMessage();
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Update_BAD, function( evt ){
      Network.SendNotificationMessage( FSM.prototype.ERRCODES.UPDATE_ERR, evt.error );

      CloseConnection();

      ReleaseResources();
    } );

    Established.Connect( Idle, this.EVENTS_NAMES.M_Notification, function( evt ){
      Network.SendNotificationMessage( FSM.prototype.ERRCODES.CEASE, 0 );

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
FSM.prototype.Start = function( thisHost, peerHost, bgpVersion, asNumber )
{
  Conf.thisHost = thisHost;
  Conf.peerHost = peerHost;

  FSM.prototype.BGP_Version = bgpVersion;

  FSM.prototype.AS_Number = asNumber;

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

FSM.prototype.ProcessMsg = function( msg )
{
  switch( msg.type )
  {
    case this.MESSAGE_TYPES.OPEN :
      ProcessOpenMsg( msg );
      break;

    case this.MESSAGE_TYPES.UPDATE :
      ProcessUpdateMsg( msg );
      break;

    case this.MESSAGE_TYPES.KEEPALIVE :
      this.Handle(
        new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.M_KeepAlive ) );
      break;

    case this.MESSAGE_TYPES.NOTIFICATION :
      ProcessNotificationMsg( msg );
      this.Handle(
        new FSM_Event.FSM_Event( FSM.prototype.EVENTS_NAMES.M_Notification ) );
      break;
  }
};

ProcessOpenMsg = function( msg )
{
  var open = {};

  open.BGPVersion = msg.data.readUInt8( 0 );
  open.peerAS     = msg.data.readUInt16BE( 1 );
  open.holdTime   = msg.data.readUInt16BE( 3 );
  open.peerBGP_Id = '';

  for( i = 0 ; i < 4 ; i++ )
  {
    open.peerBGP_Id = open.peerBGP_Id + msg.data.readUInt8( 5 + i ) + '.';
  }

  open.peerBGP_Id.slice( msg.length - 1 ); // remove the last '.'

  open.optParamLength = msg.data.readUInt8( 9 );

  open.optPar = new Array( open.optParamLength );

  for( i = 0 ; i < open.optParamLength ; i ++ )
  {
    // process and store optional parameters
  }

  console.log( "received nice OPEN msg : " );
  console.log( open );

  var evt = new FSM_Event.FSM_Event( UniqueInstance.EVENTS_NAMES.M_Open_BAD );

  // check for correctness
  if( open.BGPVersion !== UniqueInstance.BGP_Version )
  {
    evt.error = 1;
  }
  else if( open.holdTime < 3 && open.holdTime !== 0 )
  {
    evt.error = 6;
  }
  // + check if peer AS number and BGP id are valid...
  else
  {
    evt.type = UniqueInstance.EVENTS_NAMES.M_Open_OK;

    // set Hold timer value to the new time
    UniqueInstance.holdTimerValue = msg.holdTimerValue * 1000;
  }

  UniqueInstance.Handle( evt );
};

ProcessUpdateMsg = function( msg )
{
  console.log( msg );

  var evt = new FSM_Event.FSM_Event( UniqueInstance.EVENTS_NAMES.M_Update_BAD );

  var withdrawnRouteLength = msg.readUInt16BE( 0 );
  var totalPathAttriLenght = msg.readUInt16BE( 2 + withdrawnRouteLength );

  if( withdrawnRouteLength + totalPathAttriLenght + 4 !== msg.length )
  {
    evt.error = 1; // malformed attributes list
  }
  else
  {
    evt.type = UniqueInstance.EVENTS_NAMES.M_Update_OK;
  }

  UniqueInstance.Handle( evt );
};

ProcessNotificationMsg = function( msg )
{
  console.log( msg );

  var errCode    = msg.data.readUInt8( 0 );
  var errSubCode = msg.data.readUInt8( 1 );

  console.log( "Received notification code" );

  switch( errCode )
  {
    case UniqueInstance.ERRCODES.HEADER_ERR:
      console.log( "Header error" );
      console.log( "Error subcode : ");

      switch( errSubCode )
      {
        case 1: console.log( "Connection not synchronized" ); break;
        case 2: console.log( "Bad message length" ); break;
        case 3: console.log( "Bad message type" ); break;
      }
      break;

    case UniqueInstance.ERRCODES.OPEN_ERR:
      console.log( "Open error" );
      console.log( "Error subcode : " );

      switch( errSubCode )
      {
        case 1: console.log( "Unsupported version number" ); break;
        case 2: console.log( "Bad peer AS" ); break;
        case 3: console.log( "Bad bgp id" ); break;
        case 4: console.log( "Unsupported opt parameter" ); break;
        case 5: console.log( "Auth failure" ); break;
        case 6: console.log( "Unacceptable Hold time" ); break;
      }
      break;

    case UniqueInstance.ERRCODES.UPDATE_ERR:
      console.log( "Update error" );
      console.log( "Error subcode" + errSubCode );
      break;

    case UniqueInstance.ERRCODES.HOLD_TO:
      console.log( "Hold timeout" );
      break;
    case UniqueInstance.ERRCODES.FSM_ERR:
      console.log( "FSM error" );
      break;
    case UniqueInstance.ERRCODES.CEASE:
      console.log( "Cease" );
      break;
  }
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

  CloseConnection();
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

exports.FSM       = FSM;
