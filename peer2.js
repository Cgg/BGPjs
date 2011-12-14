var FSM = require( './fsm.js' );

var BgpPeer = new FSM.FSM();

// thisHost, peerHost, as_n
BgpPeer.Start( '127.0.0.2', '127.0.0.1', 4, 65002 );
