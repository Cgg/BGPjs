/* Contains all logic related to BGP FSM socket.
 * The socket tries to establish a connection to a listening bgp peer.
 * The server on the other hand is listening for a connection from a bgp peer.
 */

var net = require( 'net' );
var buf = require( 'buffer' );

var FSM_Event = require( './fsm_event' );

/* FSM_Socket */

headerRead    = false;
messageLength = 0;
messageType   = undefined;
fsmCallbackPtr = null;

fsmSocket = null;
fsmServer = null;

function sockHandle( socket )
{
  fsmSocket = socket;

  socket.addListener( 'connect', function(){
    fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_Open ) );
  } );

  socket.addListener( 'error', function( e ){
    if( e.errno === 61 ) // Connection refused
    {
      fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_OpenFailed ) );
    }
  } );

  socket.addListener( 'close', function(){
    fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_Closed ) );
  } );

  socket.addListener( 'data', function( data ){
    if( !headerRead && socket.bytesRead >= BGP_HEADER_LENGHT )
    {
    }
    else if( socket.bytesRead >= messageLength )
    {
    }
  } );
}

function StartSocket( port, host, FF )
{
  fsmCallbackPtr = FF;

  var sock = new net.Socket( { fd : null, type : 'tcp4', allowHalfOpen : false } );

  sockHandle( sock );

  sock.connect( port, host );
}

function SendOpenMessage( /* message parameters */ )
{
  var msg;
  // format message...

  // and bang !
  fsmSocket.write( msg );
}

/* FSM_Server */

function StartServer( port, host, F )
{
  fsmCallbackPtr = F;

  fsmServer = net.createServer( sockHandle );

  fsmServer.listen( port, host );
}

exports.StartSocket = StartSocket;
exports.StartServer = StartServer;
