'use strict'

import './index.css'
import 'js-marker-clusterer'
import d3 from 'd3'
import { initFilters, createChartFilter } from './filters.js'
import throttle from 'lodash/throttle'
import clusterMaker from 'clusters'
import randomColor from 'randomcolor'
import quickHull from 'quick-hull-2d'
import * as modifiers from './modifiers'

let pointChoice = -1
let iugaLastId = -1
let map = null
let markerClusterer = null
let markers = {}
let iugaPoints = []
let infowindows = {}
let infowindowsOpened = []
let runningRequest = false
let heatmap = null
let heatMap = null
let heatMapPoints = []
let isHeatMap = false
let isHeatMapCluster = false
let datasetData = {}
let datasetOptions = JSON.parse(document.querySelector('#dataset_json').innerHTML)
let datasetFilters = datasetOptions.headers;

let chartsPerPage = 2
let currentChartIndex = 0
let mouseClusters = {}
let mousePolygons = []

function HeatMapControl(controlDiv, map) {
  var control = this;

  controlDiv.style.clear = 'both';

  var heatMapUI = document.createElement('div');
  heatMapUI.id = 'heatMapUI';
  controlDiv.appendChild(heatMapUI);

  var heatMapText = document.createElement('div');
  heatMapText.id = 'heatMapText';
  heatMapText.innerHTML = 'Heatmap';
  heatMapUI.appendChild(heatMapText);

  heatMapUI.addEventListener('click', function() {
    heatMapPoints = Object.values(markers).map(function(marker) {
      marker.setVisible(isHeatMap);
      return marker.position;
    });

    isHeatMap = !isHeatMap;

    if (isHeatMap) {
      heatmap.setData(heatMapPoints);
      heatmap.setMap(map);
      markerClusterer.clearMarkers();
      heatMapText.innerHTML = 'Normal';
    } else {
      heatmap.setMap(null);
      markerClusterer.addMarkers(Object.values(markers));
      heatMapText.innerHTML = 'Heatmap';
    }
    if (infowindowsOpened) {
      infowindowsOpened.forEach(i => i.close())
      infowindowsOpened = []
    }
  });
}

const initMap = () => {
  let mapType = new google.maps.StyledMapType([{
    featureType: "all",
    elementType: "all",
    stylers: [{
      saturation: -100
    }]
  }], {
    name: "Grayscale"
  });

  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 12,
    mapTypeControlOptions: {
      mapTypeIds: [
        google.maps.MapTypeId.ROADMAP,
        google.maps.MapTypeId.HYBRID,
        google.maps.MapTypeId.SATELLITE,
        google.maps.MapTypeId.TERRAIN,
        'grayscale'
      ],
      position: google.maps.ControlPosition.TOP_RIGHT,
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
    },
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM,
    }
  });

  map.mapTypes.set('grayscale', mapType);
  // map.setMapTypeId('grayscale');

  markerClusterer = new MarkerClusterer(map, [], {
      imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
      maxZoom: 13,
  });

  heatmap = new google.maps.visualization.HeatmapLayer({
    data: heatMapPoints,
    radius: 50,
    map: map,
  });

  let heatMapDiv = document.createElement('div');
  let heatMap = new HeatMapControl(heatMapDiv, map);

  heatMapDiv.index = 1;
  heatMapDiv.style['padding-top'] = '10px';
  heatMapDiv.style['pointer-events'] = 'none';

  map.addListener('mousemove', throttle(e => {
      trackCoordinates(e.latLng)
  }, 200))

  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(heatMapDiv)

  let customControlsLeftTopElement = document.getElementById('customControlsLeftTop')
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(customControlsLeftTopElement)

  let dataset_url = document.querySelector('body').dataset['dataset']

  d3.csv(dataset_url, (err, data) => {
    processData(err, data)
    processFilter()
  })

  let charts = document.querySelectorAll('.chart')
  Array.prototype.slice.call(charts, 0, chartsPerPage).forEach(chart => {
    chart.hidden = false
  })

  let selectElement = document.querySelector('#filtersPerPage')
  if (selectElement) {
      selectElement.selectedIndex = chartsPerPage - 1
  }

  isDatasetReady()
}

const processData = (err, data) => {
  const latmed = d3.median(data, d => d[datasetOptions.latitude_attr])
  const lngmed = d3.median(data, d => d[datasetOptions.longitude_attr])

  modifiers.calculateMax(data)
  map.setCenter({
    lat: latmed,
    lng: lngmed
  });

  data.forEach((data, index) => addPoint(data, index));

  markerClusterer.addMarkers(Object.values(markers))
}

const processFilter = (dataset, filters) => {
  dataset = dataset || datasetData
  filters = filters || datasetFilters

  d3.selectAll('.chart > svg').remove()

  initFilters(Object.values(dataset))
  createChartFilter(filters, newData => {
    markerClusterer.clearMarkers()

    Object.keys(markers).forEach(x => {
      markers[x].hasMarker = false
    })

    newData.forEach((data, index) => {
      if (markers[data.geoguide_id] === undefined) {
        addPoint(data, data.geoguide_id)
      } else {
        markers[data.geoguide_id].hasMarker = true
      }
    })

    Object.keys(markers).forEach(x => {
      if (markers[x].hasMarker === false && markers[x].id !== iugaLastId) {
        delete markers[x]
      }
    })

    modifiers.clearMax()
    refreshModifiers()

    markerClusterer.addMarkers(Object.values(markers))

    if (isHeatMap) {
      isHeatMap = !isHeatMap;
      document.getElementById('heatMapUI').click();
    }
  })
}

const changeCurrentChart = button => {
  let charts = document.querySelectorAll('.chart')
  let first, last

  if (chartsPerPage === charts.length) {
    return
  }

  charts.forEach(e => {
    e.hidden = true
  })

  first = charts[0]
  last = charts[charts.length - 1]

  switch (button.value) {
    case 'Previous':
      first.parentElement.insertBefore(last, first)
      break
    case 'Next':
      last.parentElement.appendChild(first)
      break
    default:
      break
  }
  charts = document.querySelectorAll('.chart')
  for (var i = 0; i < chartsPerPage; i++) {
    charts[i].hidden = false
  }
}

const updateFiltersPage = () => {
  var e = document.querySelector('#filtersPerPage')
  var value = e.options[e.selectedIndex].value
  var charts = document.querySelectorAll('.chart')

  if (value == '*') {
    chartsPerPage = charts.length
    charts.forEach(e => {
      e.hidden = false
    })
  }
  else {
    charts.forEach(e => {
      e.hidden = true
    })
    chartsPerPage = Number(value);
    for (var i = 0; i < chartsPerPage; i++) {
      charts[i].hidden = false
    }
  }

  var buttonsContainer = document.querySelector('#collapseFilters .buttons')
  buttonsContainer.hidden = (chartsPerPage === charts.length)
}

const resetFilters = () => {
  const charts = document.querySelectorAll('.chart')
  charts.forEach((_, i) => {
    window.GeoGuide.reset(i)
  })
}

const refreshMap = () => {
  clearMap()
  resetFilters()
  processData(undefined, Object.values(datasetData))
  processFilter()
  iugaLastId = -1
  iugaPoints = []
}

const clearMap = () => {
  markerClusterer.clearMarkers()
  markers = {}
  infowindows = {}
}

const refreshModifiers = () => {
  modifiers.calculateMax(Object.keys(markers).map(x => datasetData[x]))
  Object.keys(markers).forEach(x => {
    let data = datasetData[markers[x].id]
    markers[x].setIcon(getIcon(data))
  })
}

const getIcon  = data => {
  const isIugaPoint = iugaPoints.indexOf(Number(data.geoguide_id)) > -1
  const isSelected = data.geoguide_id === iugaLastId;

  const fillColor = modifiers.getColor(data, isSelected, isIugaPoint)
  const { size, sizeBonus } = modifiers.getSize(data, isSelected, isIugaPoint)

  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: size + sizeBonus,
    fillColor: fillColor,
    fillOpacity: 0.75,
    strokeWeight: 0
  }
}

const addPoint = (data, index) => {
  datasetData[data.geoguide_id] = data;

  var contentString = '<div id="infowindow' + data.geoguide_id + '"><h4>Profile</h4><div style="max-height: 30em; overflow-y: auto; padding-bottom: 1em">';

  Object.keys(data).forEach(key => {
    if (data[key] === undefined || key === 'geoguide_id' || data[key] === '') {
      return
    }
    var value = data[key];
    if (Number(data[key])) {
      var number = Number(data[key]);
      value = Number.isInteger(number) ? number.toString() : parseFloat(Number(data[key]).toFixed(5)).toString();
    }
    contentString += '<b>' + key + '</b>: <code>' + value + '</code><br />';
  })
  contentString += '</div><button type="button" class="btn btn-default" onclick="GeoGuide.showPotentialPoints(this)">Explore</button>';
  contentString += '</div>';

  var infowindow = new google.maps.InfoWindow({
    content: contentString
  });

  var marker = new google.maps.Marker({
    position: new google.maps.LatLng(data[datasetOptions.latitude_attr], data[datasetOptions.longitude_attr]),
    icon: getIcon(data),
    id: data.geoguide_id,
    hasMarker: true
  })

  marker.addListener('click', () => {
    if (infowindowsOpened) {
      infowindowsOpened.forEach(i => i.close())
      infowindowsOpened = []
    }
    infowindow.open(map, marker);
    infowindowsOpened.push(infowindow)
    pointChoice = marker.id
    if (datasetOptions.indexed === false) {
      var btnElement = document.querySelector('#infowindow' + marker.id + ' button')
      btnElement.setAttribute('disabled', 'disabled')
      btnElement.setAttribute('title', 'This dataset isn\'t ready yet.')
    }
  })

  infowindows[marker.id] = infowindow
  markers[marker.id] = marker

  return markers[marker.id]
}

const showPotentialPoints = e => {
  if (runningRequest === false) {
    runningRequest = true;
    let oldText = e.innerHTML;
    e.innerHTML = 'Loading...'
    let loader = new XMLHttpRequest();
    let data = new FormData();
    let icon = null;
    iugaPoints = null;
    loader.onreadystatechange = () => {
      if (loader.readyState === XMLHttpRequest.DONE) {
        if (infowindowsOpened) {
          infowindowsOpened.forEach(i => i.close())
          infowindowsOpened = []
        }
        if (loader.status === 200) {
          let jsonResponse = JSON.parse(loader.responseText)

          iugaPoints = []

          jsonResponse.points.forEach(id => {
            if (id === pointChoice) {
              return
            }
            iugaPoints.push(Number(id))
          })

          if (document.querySelector('#onlyfilteredpoints').checked) {
            markerClusterer.clearMarkers()
            Object.keys(markers).forEach(x => {
              markers[x].setIcon(getIcon(datasetData[x]))
            })
          } else {
            resetFilters()
            clearMap()
            Object.values(datasetData).forEach((data, index) => {
              addPoint(data, index)
            })
          }

          markerClusterer.addMarkers(Object.values(markers))
          showClustersFromMouseTrackingAfterIuga()
        } else if (loader.status === 202) {
          window.alert('Not ready yet.')
        }
        runningRequest = false
        e.innerHTML = oldText;
      }
    }
    let url = '/environment/' + datasetOptions.filename + '/' + pointChoice + '/iuga'

    url += '?limit=' + document.getElementById("timelimit").value
    url += '&sigma=' + document.getElementById("sigma").value
    url += '&k=' + document.getElementById("kvalue").value

    if (document.querySelector('#onlyfilteredpoints').checked) {
      if (Object.keys(datasetData).length !== Object.keys(markers).length) {
        const filtered_points = Object.keys(markers).map(x => markers[x].id)
        data.append('filtered_points', filtered_points.join(','))
        if (document.getElementById("kvalue").value > filtered_points.length - 2) {
          alert("You don't have enough filtered points")
          runningRequest = false
          return
        }
      }
    }
    let clusters = getClustersFromMouseTracking()
    mouseClusters = clusters
    let greatestCluster = clusters.reduce((value, cluster) => Math.max(cluster.points.length, value), 0)
    data.append('clusters', clusters.map(cluster => [...cluster.centroid, (cluster.points.length/greatestCluster)].join(':')).join(','))
    loader.open('POST', url, true)
    loader.send(data)
    mouseTrackingCoordinates = []
    mouseTrackingMarkers = []
    iugaLastId = pointChoice
  }
}

const isDatasetReady = () => {
  if (datasetOptions.indexed === false) {
    let req = new window.XMLHttpRequest()
    req.onreadystatechange = () => {
      if (req.status === 200 && req.readyState === window.XMLHttpRequest.DONE) {
        datasetOptions = JSON.parse(req.responseText)
        if (datasetOptions.indexed === false) {
          setTimeout(isDatasetReady, 1000)
        } else if (pointChoice >= 0) {
          let btnElement = document.querySelector('#infowindow' + pointChoice + ' button')
          if (btnElement !== null) {
            btnElement.removeAttribute('disabled')
            btnElement.removeAttribute('title')
          }
        }
      }
    }
    let url = '/environment/' + datasetOptions.filename + '/details'
    req.open('GET', url, true)
    req.send()
  }
}

let mouseTrackingCoordinates = []
let mouseTrackingMarkers = []

const trackCoordinates = latLng => {
  mouseTrackingCoordinates.push(latLng);
  if (isHeatMapCluster) {
    heatmap.setData(mouseTrackingCoordinates);
  }
}

const getClustersFromMouseTracking = () => {
  const rawPoints = mouseTrackingCoordinates.map(latLng => [latLng.lat(), latLng.lng()])
  clusterMaker.data(rawPoints)
  return clusterMaker.clusters()
}

const showClustersFromMouseTracking = () => {
  clearClustersFromMouseTracking()
  if (mouseTrackingMarkers.length > 0) {
    mouseTrackingMarkers.forEach(marker => {
      marker.setMap(null)
    })
    mouseTrackingMarkers = []
    if (isHeatMapCluster) {
      heatmap.setData(mouseTrackingCoordinates);
      heatmap.setMap(map);
    } else {
      markerClusterer.addMarkers(Object.values(markers))
    }
    return
  }

  heatmap.setMap(null)
  markerClusterer.clearMarkers()

  const rawPoints = mouseTrackingCoordinates.map(latLng => [latLng.lat(), latLng.lng()])
  clusterMaker.data(rawPoints)
  let clusters = clusterMaker.clusters()
  clusters.forEach((cluster, i) => {
    const color = randomColor()
    const markers = cluster.points.map((point, j) => {
      return new google.maps.Marker({
        position: new google.maps.LatLng(...point),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: color,
          fillOpacity: 0.75,
          strokeWeight: 0
        },
        id: `{i}.{j}`,
        map: map
      })
    })
    mouseTrackingMarkers = [
        ...mouseTrackingMarkers,
        ...markers
    ]

    var hull = quickHull(cluster.points);
    var path = hull.map((point) => ({
      lat: point[0],
      lng: point[1]
    }));

    var pol = new google.maps.Polygon({
      paths: path,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35
    });
    pol.setMap(map);
    mousePolygons.push(pol);
  });
}

const showClustersFromMouseTrackingAsHeatmap = () => {
  isHeatMapCluster = !isHeatMapCluster

  if (isHeatMapCluster) {
    heatmap.setData(mouseTrackingCoordinates);
    heatmap.setMap(map);
    markerClusterer.clearMarkers();
  } else {
    heatmap.setMap(null);
    markerClusterer.addMarkers(Object.values(markers));
  }

  if (infowindowsOpened) {
    infowindowsOpened.forEach(i => i.close())
    infowindowsOpened = []
  }
}

const showClustersFromMouseTrackingAfterIuga = () => {
  clearClustersFromMouseTracking()
  mouseClusters.forEach((cluster, i) => {
    const color = randomColor()

    var hull = quickHull(cluster.points)
    var path = hull.map((point) => ({
      lat: point[0],
      lng: point[1]
    }))

    var pol = new google.maps.Polygon({
      paths: path,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.35
    })
    pol.setMap(map)
    mousePolygons.push(pol)
  });
}

const clearClustersFromMouseTracking = () => {
  mousePolygons.map((polygon) => {
    polygon.setMap(null)
  })
  mousePolygons = []
}

window.GeoGuide = window.GeoGuide || {}

window.GeoGuide = {
  ...window.GeoGuide,
  refreshMap,
  refreshModifiers,
  showPotentialPoints,
  changeCurrentChart,
  updateFiltersPage,
  initMap,
  showClustersFromMouseTrackingAsHeatmap,
  showClustersFromMouseTracking
}
