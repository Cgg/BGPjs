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

  this.wiredEvents = {};

  // ...
}

/* Connect this state to another via a transition triggered by an event */
State.prototype.Connect = function( state, evt, transition )
{
  this.wiredEvents[ evt ] = { transitionFct : transition, nextState : state };
};

/* Handle called upon reception of an event */
State.prototype.Handle = function( evt )
{
  // look for evt in wiredEvt
  if( this.wiredEvents[ evt.type ] !== undefined )
  {
    this.wiredEvents[ evt.type ].transitionFct( evt );
    return this.wiredEvents[ evt.type ].nextState;
  }
  else
  {
    return this.DefaultBehavior();
  }
};

State.prototype.DefaultBehavior = function()
{
  return this;
};

exports.State = State;
