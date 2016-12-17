module.exports =
class VariationalJavaView
  constructor: (serializedState) ->
    # Create root element
    @element = document.createElement('div');
    @element.classList.add('cc-ide');



  # Returns an object that can be retrieved when package is activated
  serialize: ->

  # Tear down any state and detach
  destroy: ->
    @element.remove();


  getElement: ->
    return @element;
