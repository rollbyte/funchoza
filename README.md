# Funchoza.js
lightweight javascript MVVM framework

## Quick start

Define a model in javascript

```javascript
	var myApp = {
		  prop: 'some text',
		  info: function () {
		    return 'Member position is [' + this.member1.x + ', ' + this.member1.y + ']';
		  },
		  member1: {
		    x: 200,
		    y: 400,
		    go: function () {
		      this.x += 100;
		    }    
		  }
	};

```
Bind DOM-elements to model properties and functions

```html
<html>
<head>
<style>
  #ball {
    position: absolute;
    width: 100px;
    height: 100px;
    background-color: green;
  }
</style>
</head>
<body>
<div fz-scope="myApp" fz-watch-children="true">
  <div fz-data="prop"></div>
  <div fz-data="info"></div>
  <scope fz-scope="member1">
  	<button type="button" fz-handlers="click:go">GO!</button>
    <div id="ball" fz-style="left:x;top:y">Let's go!</div>
  </scope>
</div>
</body>
</html>
```

Open page, click on **GO!** button, watch how page changes.
For detailed documentation please visit framework [site](https://www.funchoza.dev).