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
module.exports=
class CCModel
  model: null

  #constants
  @CHOICE_TYPE: "choice"
  @TEXT_TYPE: "text"
  @SPAN: "span"
  @SPAN_START: "start"
  @SPAN_END: "end"
  @SEGMENTS: "segments"
  @TYPE: "type"
  @CONTENT: "content"
  @KIND: "kind"
  @POSITIVE: "positive"
  @CONTRAPOSITIVE: "contrapositive"

  @POSITIVE_TEXT: "ifdef"
  @CONTRAPOSITIVE_TEXT: "ifndef"

  @ELSE: "else"
  @END: "endif"

  @RIGHT_CHOICE: "thenbranch"
  @LEFT_CHOICE: "elsebranch"

  @ROW: 0
  @COLUMN: 1

  constructor: (model) ->
    @model = model;

  toText: (model) ->
    text = ""
    for seg in model[@SEGMENTS]
      if seg[@TYPE] == @TEXT_TYPE
        text += seg[@CONTENT]
      else if seg[@TYPE == @CHOICE_TYPE]
        text += @toText(choice[@RIGHT_CHOICE])
        text += @ELSE
        text += @toText(choice[@LEFT_CHOICE])
        text += @END
    return text
