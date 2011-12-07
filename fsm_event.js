/* This is called FSM_Event in order to make a distinction between this and
 * the Javascript type "event"
 */

function FSM_Event( type )
{
  this.type = type;
}

exports.FSM_Event = FSM_Event;
