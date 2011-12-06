function State( name )
{
  this.name = name;

  // the wiredEvents array holds what should be done upon reception of
  // events.
  // It is indexed by events' names.
  // event's name => { transition, nextState }

  // transition is a function that will be executed when receiving the
  // event.
  // Adding parameters to transition (that would be carried by the
  // event) is left to the user's discretion.

  this.wiredEvents = new Array( 0 );

  // ...
};

/* Connect this state to another via a transition triggered by an event */
State.prototype.Connect = function( state, evt, transition )
{
  wiredEvents.push( { transitionFct : transition, nextState : state } );
};

/* Handle called upon reception of an event */
State.prototype.Handle = function( evt )
{
  // look for evt in wiredEvt

  // if evt found, exec transitionFct and return nextState

  // else

  return this.DefaultBehavior();
};

State.prototype.DefaultBehavior = function()
{
  return this;
};
