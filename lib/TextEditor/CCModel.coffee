#Class for holding and manipulating the cc model.
#Model is represented:
#[
#
#  { ### object type text
#    content: string,
#    span:
#    {
#          end: [column, row], start:[column, row]
#    }
#     type: "text"
#  },
#  { ### object type choice
#   dimension: string,
#   left:[choice or text]
#   right:[choice or text]
#   span:
#   {
#     end: [row, column],
#     start:[row, column]
#   }
#   type:"choice"
#]
class CCModel
  model: null

  #constants
  @CHOICE_TYPE: "choice"
  @TEXT_TYPE: "text"
  @ROW: 0
  @COLUMN: 1

  constructor: (model) ->
    @model = model;

  choiceNode: (dimension, left, right, span) ->
    return {dimension:dimension, left:left, right:right, span:span, type: @CHOICE_TYPE}

  textNode: (content, span) ->
    return {content:content, span: span, type: @TEXT_TYPE}

  
