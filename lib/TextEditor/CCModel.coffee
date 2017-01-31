#Class for holding and manipulating the cc model.

module.exports=
class CCModel
	model: null

	#constants
	CHOICE_TYPE: "choice"
	TEXT_TYPE: "text"
	SPAN: "span"
	SPAN_START: "start"
	SPAN_END: "end"
	SEGMENTS: "segments"
	TYPE: "type"
	CONTENT: "content"
	KIND: "kind"
	POSITIVE: "positive"
	CONTRAPOSITIVE: "contrapositive"

	POSITIVE_TEXT: "ifdef"
	CONTRAPOSITIVE_TEXT: "ifndef"

	ELSE: "else"
	END: "endif"

	RIGHT_CHOICE: "thenbranch"
	LEFT_CHOICE: "elsebranch"

	ROW: 0
	COLUMN: 1

	constructor: (model) ->
		@model = model;

	getClosestContextRegion: (point) ->
		return _getClosestContextRegion(point, @model);

	_getClosestContextRegion: (point, model) ->
		for seg in @model[@SEGMENTS]
			if seg[@TYPE] == @CHOICE_TYPE
				if @_contains(point, seg[@RIGHT_CHOICE][@span])
					return _getClosestContextRegion(point, seg[@RIGHT_CHOICE])
				if @_contains(point, seg[@LEFT_CHOICE][@span])
					return _getClosestContextRegion(point, seg[@LEFT_CHOICE])
		return new CCModel(model)

	_contains: (point, span) ->
		return point.row > seg[@SPAN][@SPAN_START][@ROW] && point.row < seg[@SPAN][@SPAN_END][@ROW]

	isChoiceNode: ->
		return @model[@SEGMENTS].length == 1 && @model[@SEGMENTS][0][@TYPE] == @CHOICE_TYPE

	choiceName: ->
		if(@isChoiceNode())
			return @model[@SEGMENTS][0][@NAME]
		return null

	getAllChoiceNodes: ->
		return @_getAllChoiceNodes(@model)

	_getAllChoiceNodes: (model) ->
		nodes = []
		for seg in model[@SEGMENTS]
			if seg[@TYPE] == @CHOICE_TYPE
				nodes.push(seg)
				nodes.concat(@_getAllChoiceNodes(seg[@RIGHT_CHOICE]))
				nodes.concat(@_getAllChoiceNodes(seg[@LEFT_CHOICE]));
		return nodes

	toText: () ->
		text = ""
		for seg in @model[@SEGMENTS]
			if seg[@TYPE] == @TEXT_TYPE
				text += seg[@CONTENT]
			else if seg[@TYPE == @CHOICE_TYPE]
				text += @toText(choice[@RIGHT_CHOICE])
				text += @ELSE
				text += @toText(choice[@LEFT_CHOICE])
				text += @END
		return text
