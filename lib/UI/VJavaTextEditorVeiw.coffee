class VJavaTextEditorVeiw
  constructor: (serializedState) ->
    # Create root element
    @element = $("div")
    @element.classList.add('cc-ide');



  # Returns an object that can be retrieved when package is activated
  serialize: ->

  # Tear down any state and detach
  destroy: ->
    @element.remove();


  getElement: ->
    return @element;
