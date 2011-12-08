/* Contains all logic related to BGP FSM socket.
 * The socket tries to establish a connection to a listening bgp peer.
 * The server on the other hand is listening for a connection from a bgp peer.
 */

var net = require( 'net' );

var FSM       = require( './fsm' );
var FSM_Event = require( './fsm_event' );

/* FSM_Socket */

headerRead    = false;
messageLength = 0;
messageType   = undefined;
fsmCallbackPtr = FSM.UniqueInstance;

fsmSocket = null;

fsmServer = null; 
fsmSocketServer = null;

incomingMessage = new Buffer( 4096 );
incomingMessage.fill( 0 );
endOfIncomingMessage = 0; // index where the partial incoming message ends

HEADER_LENGHT = 19; // bgp header length in bytes

function sockHandle( socket )
{
  socket.addListener( 'connect', function(){
    fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_Open ) );
  } );

  socket.addListener( 'error', function( e ){
    if( e.errno == 'ECONNREFUSED' ) // Connection refused
    {
      fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_OpenFailed ) );
    }
  } );

  socket.addListener( 'close', function(){
    fsmCallbackPtr.Handle( new FSM_Event.FSM_Event( fsmCallbackPtr.EVENTS_NAMES.BGP_TC_Closed ) );
  } );

  socket.addListener( 'data', function( data ){
    // read header
    data.copy( incomingMessage, endOfIncomingMessage );

    endOfIncomingMessage = endOfIncomingMessage + socket.bytesRead;

    if( !headerRead  && endOfIncomingMessage >= HEADER_LENGHT )
    {
      ReadHeader();
    }

    if( headerRead && endOfIncomingMessage >= messageLength )
    {
      ReadMessage();
    }

    socket.bytesReads = 0;
  } );
}

function StartSocket( port, host )
{
  console.log( "starting socket" );
  fsmCallbackPtr = FSM.UniqueInstance;

  fsmSocket = new net.Socket( { fd : null, type : 'tcp4', allowHalfOpen : false } );

  sockHandle( fsmSocket );

  fsmSocket.connect( port, host );
}

function StopSocket()
{
  console.log( "stopping socket" );

  if( fsmSocket !== null )
  {
    fsmSocket.destroy();
    fsmSocket = null;
  }
}

// read and consume the bgp header from incoming message
function ReadHeader()
{
  var header = incomingMessage.slice( 0, HEADER_LENGHT - 1 );

  headerRead = true;
}

function ReadMessage()
{
  var message = incomingMessage.slice( 0, messageLength );

  // determine message type and extract info accordingly

  headerRead = false;

  // finally, call the callback
  var evt = new FSM_Event.FSM_Event();

  fsmCallbackPtr.Handle( evt );
}

function WriteHeader( msgType, msg )
{
  // marker is set to ones
  for( i = 0 ; i < 16 ; i++ )
  {
    b[ i ] = 255;
  }

  // length
  b.writeUInt16BE( b.length, 16 );

  // message type
  b.writeUInt8( msgType, 18 );
}

function SendOpenMessage( /* message parameters ? */ )
{
  var msg = new Buffer( 29 );

  // format message...
  WriteHeader( FSM.UniqueInstance.MESSAGE_TYPES.OPEN );

  msg.WriteUInt8( 4, 19 ); // BGP version
  msg.WriteUInt16BE( fsmCallbackPtr.AS_Number, 20 ); // AS_Number, Big Endian
  msg.WriteUInt16BE( fsmCallbackPtr.HoldTime, 22 );  // HoldTime, Big Endian

  // and bang !
  fsmSocket.write( msg );
}

function SendUpdateMessage()
{
}

function SendKeepAliveMessage()
{
}

function SendNotificationMessage()
{
}

/* FSM_Server */

function StartServer( port, host )
{
  fsmServer = net.createServer( function( sock ){
    fsmSocketServer = sock;
    sockHandle( sock );
  } );

  fsmServer.listen( port, host );
}

function StopServer()
{
  if( fsmSocketServer !== null )
  {
    fsmSocketServer.destroy();
    fsmSocketServer = null;
  }

  if( fsmServer !== null )
  {
    fsmServer.close();
    fsmServer = null;
  }
}

exports.StartSocket             = StartSocket;
exports.StartServer             = StartServer;
exports.StopSocket              = StopSocket;
exports.StopServer              = StopServer;
exports.SendOpenMessage         = SendOpenMessage;
exports.SendUpdateMessage       = SendUpdateMessage;
exports.SendKeepAliveMessage    = SendKeepAliveMessage;
exports.SendNotificationMessage = SendNotificationMessage;
