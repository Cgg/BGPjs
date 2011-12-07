var State = require( './state' );

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
  M_Open                  : "M_Open",
  M_KeepAlive             : "M_KeepAlive",
  M_Update                : "M_Update",
  M_Notification          : "M_Notification"
};

/* FSM's global variables (accessible by the states) */
FSM.prototype.VARIABLES =
{
  ConnectTimer       : "todo",  // big TODO over here
  HoldTimer          : "todo",
  KeepAliveTimer     : "todo",
  ConnectionToPeer   : "todo",
  ConnectionFromPeer : "todo"
};


/* Functions' definitions */

function FSM()
{
  // create FSM's states
  var Idle        = new State.State( this.STATES_NAMES.Idle );
  var Connect     = new State.State( this.STATES_NAMES.Connect );
  var Active      = new State.State( this.STATES_NAMES.Active );
  var OpenSent    = new State.State( this.STATES_NAMES.OpenSent );
  var OpenConfirm = new State.State( this.STATES_NAMES.OpenConfirm );
  var Established = new State.State( this.STATES_NAMES.Established );

  // Link the states together with events and transitions
  // TODO

  // init current state variable
  this.currentState = Idle;

  // at the end of the scope, the states should not be deleted, since each
  // state keeps references on some other states.

  // Init FSM global variables / objects
}

/* FSM's event handler */
FSM.prototype.Handle = function( evt )
{
  this.currentState = this.currentState.Handle( evt );
};

exports.FSM = FSM;
