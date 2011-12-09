/* Contains all logic related to BGP FSM socket.
 * The socket tries to establish a connection to a listening bgp peer.
 * The server on the other hand is listening for a connection from a bgp peer.
 */

var net = require( 'net' );

var FSM       = require( './fsm' );
var FSM_Event = require( './fsm_event' );
var Conf      = require( './conf' );

/* FSM_Socket */

headerRead    = false;
messageLength = 0;
messageType   = undefined;

tempSocket = null;

fsmServer = null; 

fsmSocket = null;

incomingMessage = new Buffer( 4096 );
incomingMessage.fill( 0 );
endOfIncomingMessage = 0; // index where the partial incoming message ends

HEADER_LENGHT = 19; // bgp header length in bytes

function sockHandle( socket )
{
  socket.addListener( 'connect', function(){
    FSM.UniqueInstance.Handle( new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_Open ) );
  } );

  socket.addListener( 'error', function( e ){
    if( e.errno == 'ECONNREFUSED' ) // Connection refused
    {
      FSM.UniqueInstance.Handle( new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_OpenFailed ) );
    }
  } );

  socket.addListener( 'close', function(){
    FSM.UniqueInstance.Handle( new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_Closed ) );
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

// read and consume the bgp header from incoming message
function ReadHeader()
{
  var header = incomingMessage.slice( 0, HEADER_LENGHT );

  // TODO

  headerRead = true;
}

function ReadMessage()
{
  var message = incomingMessage.slice( 0, messageLength );
  var msg     = {};

  // determine message type and extract info into msg accordingly
  // TODO

  headerRead = false;

  // finally, call the callback
  var evt = new FSM_Event.FSM_Event( /* event type */ );

  evt.msg = msg;

  FSM.UniqueInstance.Handle( evt );
}

function WriteHeader( msgType, msg )
{
  // marker is set to ones
  for( i = 0 ; i < 16 ; i++ )
  {
    msg[ i ] = 255;
  }

  // length
  msg.writeUInt16BE( msg.length, 16 );

  // message type
  msg.writeUInt8( msgType, 18 );
}

function SendOpenMessage( /* message parameters ? */ )
{
  var msg = new Buffer( 29 );

  // format message...
  WriteHeader( FSM.UniqueInstance.MESSAGE_TYPES.OPEN, msg );

  msg.writeUInt8( Conf.BGP_Version, 19 ); // BGP version
  msg.writeUInt16BE( Conf.AS_Number, 20 ); // AS_Number, Big Endian
  msg.writeUInt16BE( Math.round( FSM.UniqueInstance.holdTimerValue / 1000 ), 22 );  // HoldTime, Big Endian

  // write the bgp identifier
  var local_address = ( Conf.thisHost !== 'localhost' ? Conf.thisHost : '127.0.0.1' );
  var pieces = local_address.split( '.' );

  for( i = 0 ; i < 4 ; i++ )
  {
    msg.writeUInt8( parseInt( pieces[ i ], 10 ), 24 + i );
  }

  msg.writeUInt8( 0, 28 ); // number of optional parameters

  // and bang !
  fsmSocket.write( msg );
}

function SendUpdateMessage( /* Update parameters ... */ )
{
  var msg = new Buffer( 23 );

  WriteHeader( FSM.UniqueInstance.MESSAGE_TYPES.UPDATE, msg );

  // set both withdrawn route and total path attribute lenght to 0
  msg.writeUInt16BE( 0, 19 );
  msg.writeUInt16BE( 0, 21 );

  fsmSocket.write( msg );
}

function SendKeepAliveMessage()
{
  var msg = new Buffer( 19 );

  // format message...
  WriteHeader( FSM.UniqueInstance.MESSAGE_TYPES.KEEPALIVE, msg );

  // and bang !
  fsmSocket.write( msg );
}

function SendNotificationMessage( errCode, errSubcode )
{
  var msg = new Buffer( 21 );

  // format message...
  WriteHeader( FSM.UniqueInstance.MESSAGE_TYPES.NOTIFICATION, msg );

  msg.writeUInt8( errCode, 19 );
  msg.writeUInt8( errSubcode, 20 );

  // and bang !
  fsmSocket.write( msg );
}

/* Socket */

function StartSocket( port, host )
{
  console.log( "starting socket" );

  tempSocket = new net.Socket( { fd : null, type : 'tcp4', allowHalfOpen : false } );

  tempSocket.on( 'connect', function(){
    debugger;

    // stop the server that's listening for a connection from the peer
    fsmServer.close();
    fsmServer = null;

    fsmSocket = tempSocket;
    sockHandle( fsmSocket );

    FSM.UniqueInstance.Handle(
      new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_Open ) );
  } );

  tempSocket.on( 'error', function( e ){
    if( e.code === 'ECONNREFUSED' )
    {
      debugger;
      FSM.UniqueInstance.Handle(
        new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_OpenFailed ) );
    }
  } );

  tempSocket.connect( port, host );
}

function StopSocket()
{
  console.log( "stopping socket" );

  if( tempSocket !== null )
  {
    tempSocket.destroy();
    tempSocket = null;
  }

  if( fsmSocket !== null )
  {
    fsmSocket.destroy();
    fsmSocket = null;
  }
}

/* FSM_Server */

function StartServer( port, host )
{
  fsmServer = net.createServer( function( sock ){
    debugger;

    // stop the socket that's trying to establish a connection
    tempSocket = null;

    fsmSocket = sock;

    sockHandle( sock );

    FSM.UniqueInstance.Handle( 
      new FSM_Event.FSM_Event( FSM.UniqueInstance.EVENTS_NAMES.BGP_TC_Open ) );
  } );

  fsmServer.listen( port, host );
}

function StopServer()
{
  if( fsmSocket !== null )
  {
    fsmSocket.destroy();
    fsmSocket = null;
  }

  if( fsmServer !== null )
  {
    fsmServer.close();
    fsmServer = null;
  }
}

function TestWriteMsg()
{
  // tries to write an OPEN message (w/o actually sending it)
  var msg = Buffer( 29 );

  // format message...
  WriteHeader( 42, msg );

  msg.writeUInt8( Conf.BGP_Version, 19 ); // BGP version
  msg.writeUInt16BE( Conf.AS_Number, 20 ); // AS_Number, Big Endian
  msg.writeUInt16BE( 20000, 22 );  // HoldTime, Big Endian

  // write the bgp identifier
  var local_address = ( Conf.thisHost !== 'localhost' ? Conf.thisHost : '127.0.0.1' );
  var pieces = local_address.split( '.' );

  debugger;

  for( i = 0 ; i < 4 ; i++ )
  {
    msg.writeUInt8( parseInt( pieces[ i ], 10 ), 24 + i );
  }

  msg.writeUInt8( 0, 28 ); // number of optional parameters
}

exports.StartSocket             = StartSocket;
exports.StartServer             = StartServer;
exports.StopSocket              = StopSocket;
exports.StopServer              = StopServer;
exports.SendOpenMessage         = SendOpenMessage;
exports.SendUpdateMessage       = SendUpdateMessage;
exports.SendKeepAliveMessage    = SendKeepAliveMessage;
exports.SendNotificationMessage = SendNotificationMessage;

exports.TestWriteMsg = TestWriteMsg;
