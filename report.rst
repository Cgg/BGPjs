A BGP FSM implementation
========================

KTH
Routing in Internet and other complex networks
Clément Geiger


The Border Gateway Protocol (BGP) is defined by `RFC 1771 <http://www.ietf.org/rfc/rfc1771.txt>`__.
Particularly, a BGP connection is described as Finite State Machine (FSM) in
section 8. The purpose of the homework described by this report was to implement
this FSM using the technology of my choice.


Doing this as a one person team, I had to limit the field of my work. I chose to
implement a straight basic FSM :

 - Establishing a connection with a peer
 - Exchanging KeepAlive messages

Most notably, there no Update mechanism whatsoever. Also, optional parameters
are not taken into account.


Technology


