#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static NSString * const LJURLString = @"https://one-vv0199.com/casino/play/v_1wingames:luckyjet?p=yshe";

@interface LJCollectorViewController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UITableViewDataSource>
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, strong) UILabel *statsLabel;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) UIButton *startButton;
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *events;
@property (nonatomic, strong) NSDateFormatter *isoFormatter;
@property (nonatomic, strong) NSDateFormatter *clockFormatter;
@property (nonatomic, strong) NSDate *lastEventDate;
@property (nonatomic, strong) NSDate *acceptAfterDate;
@property (nonatomic) double lastEventValue;
@property (nonatomic) BOOL collecting;
@end

@implementation LJCollectorViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"LuckyJet 10x+";
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.navigationController.navigationBar.prefersLargeTitles = NO;
    self.events = [NSMutableArray array];

    self.isoFormatter = [NSDateFormatter new];
    self.isoFormatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    self.isoFormatter.timeZone = [NSTimeZone timeZoneWithName:@"Europe/Kyiv"];
    self.isoFormatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSXXX";

    self.clockFormatter = [NSDateFormatter new];
    self.clockFormatter.locale = [NSLocale localeWithLocaleIdentifier:@"ru_RU"];
    self.clockFormatter.timeZone = [NSTimeZone timeZoneWithName:@"Europe/Kyiv"];
    self.clockFormatter.dateFormat = @"HH:mm:ss";

    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    WKUserContentController *uc = [WKUserContentController new];
    [uc addScriptMessageHandler:self name:@"lj10"];
    WKUserScript *script = [[WKUserScript alloc] initWithSource:[self collectorScript]
                                                  injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                               forMainFrameOnly:NO];
    [uc addUserScript:script];
    config.userContentController = uc;
    config.websiteDataStore = WKWebsiteDataStore.defaultDataStore;

    self.webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.allowsBackForwardNavigationGestures = YES;

    self.statusLabel = [UILabel new];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.statusLabel.numberOfLines = 2;
    self.statusLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightSemibold];
    self.statusLabel.text = @"Откройте игру и дождитесь, пока она полностью загрузится. Затем нажмите «НАЧАТЬ НОВЫЙ ЗАМЕР».";

    self.statsLabel = [UILabel new];
    self.statsLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.statsLabel.numberOfLines = 2;
    self.statsLabel.font = [UIFont monospacedDigitSystemFontOfSize:14 weight:UIFontWeightSemibold];
    self.statsLabel.text = @"Новых 10x+: 0 / 10\nСредний интервал: —";

    self.startButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.startButton.translatesAutoresizingMaskIntoConstraints = NO;
    self.startButton.configuration = [UIButtonConfiguration filledButtonConfiguration];
    [self.startButton setTitle:@"НАЧАТЬ НОВЫЙ ЗАМЕР" forState:UIControlStateNormal];
    [self.startButton addTarget:self action:@selector(startNewSession) forControlEvents:UIControlEventTouchUpInside];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    reload.translatesAutoresizingMaskIntoConstraints = NO;
    reload.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [reload setTitle:@"Открыть LuckyJet" forState:UIControlStateNormal];
    [reload addTarget:self action:@selector(loadLuckyJet) forControlEvents:UIControlEventTouchUpInside];

    UIButton *export = [UIButton buttonWithType:UIButtonTypeSystem];
    export.translatesAutoresizingMaskIntoConstraints = NO;
    export.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [export setTitle:@"Экспорт результата" forState:UIControlStateNormal];
    [export addTarget:self action:@selector(exportSession) forControlEvents:UIControlEventTouchUpInside];

    UIStackView *buttons = [[UIStackView alloc] initWithArrangedSubviews:@[self.startButton, reload, export]];
    buttons.translatesAutoresizingMaskIntoConstraints = NO;
    buttons.axis = UILayoutConstraintAxisHorizontal;
    buttons.spacing = 6;
    buttons.distribution = UIStackViewDistributionFillEqually;

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.translatesAutoresizingMaskIntoConstraints = NO;
    self.tableView.dataSource = self;

    [self.view addSubview:self.statusLabel];
    [self.view addSubview:self.statsLabel];
    [self.view addSubview:buttons];
    [self.view addSubview:self.tableView];
    [self.view addSubview:self.webView];

    UILayoutGuide *g = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [self.statusLabel.topAnchor constraintEqualToAnchor:g.topAnchor constant:6],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:10],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-10],
        [self.statsLabel.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:4],
        [self.statsLabel.leadingAnchor constraintEqualToAnchor:self.statusLabel.leadingAnchor],
        [self.statsLabel.trailingAnchor constraintEqualToAnchor:self.statusLabel.trailingAnchor],
        [buttons.topAnchor constraintEqualToAnchor:self.statsLabel.bottomAnchor constant:6],
        [buttons.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:8],
        [buttons.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-8],
        [buttons.heightAnchor constraintEqualToConstant:42],
        [self.tableView.topAnchor constraintEqualToAnchor:buttons.bottomAnchor constant:4],
        [self.tableView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.tableView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.tableView.heightAnchor constraintEqualToConstant:235],
        [self.webView.topAnchor constraintEqualToAnchor:self.tableView.bottomAnchor],
        [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor]
    ]];

    [UIApplication sharedApplication].idleTimerDisabled = YES;
    [self loadLuckyJet];
}

- (void)dealloc {
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"lj10"];
    [UIApplication sharedApplication].idleTimerDisabled = NO;
}

- (NSString *)collectorScript {
    NSArray<NSString *> *parts = @[
        @"(function(){",
        @"if(window.__lj10Installed)return;window.__lj10Installed=true;",
        @"var elementState=new WeakMap();var arrState={};var scalarState={};",
        @"function post(obj){try{window.webkit.messageHandlers.lj10.postMessage(obj);}catch(e){}}",
        @"function num(v){if(typeof v==='number')return v;if(typeof v==='string'){var s=v.replace(',','.').replace(/[^0-9.]/g,'');var n=parseFloat(s);return isFinite(n)?n:null;}return null;}",
        @"function emitBig(v,source,ctx){var n=num(v);if(n===null||n<10)return;post({type:'big',value:n,source:source||'unknown',context:String(ctx||'').slice(0,500),url:location.href});}",
        @"function exactX(t){var m=String(t||'').trim().match(/^(\\d{1,3}(?:[\\.,]\\d{1,3})?)\\s*[xX×]$/);return m?parseFloat(m[1].replace(',','.')):null;}",
        @"function scanDom(){try{var nodes=document.querySelectorAll('span,div,li,p,b,strong,td');var now=Date.now();var begin=Math.max(0,nodes.length-900);for(var i=begin;i<nodes.length;i++){var el=nodes[i];if(!el||el.children.length>3)continue;var text=(el.textContent||'').trim();if(text.length>24)continue;var v=exactX(text);var st=elementState.get(el);if(!st){elementState.set(el,{text:text,changed:now,sent:true});continue;}if(st.text!==text){st.text=text;st.changed=now;st.sent=false;continue;}if(!st.sent&&v!==null&&v>=10&&(now-st.changed)>=1300){st.sent=true;emitBig(v,'dom-stable',text);}}}catch(e){}}",
        @"setInterval(scanDom,350);document.addEventListener('DOMContentLoaded',function(){setTimeout(scanDom,300);});",
        @"function handleArray(key,a,source){var vals=a.map(num).filter(function(x){return x!==null;});if(!vals.length)return;var prev=arrState[key];arrState[key]=vals.slice(0);if(!prev||!prev.length)return;var cand=null;if(vals.length>prev.length){if(vals[0]!==prev[0])cand=vals[0];else cand=vals[vals.length-1];}else if(vals[0]!==prev[0])cand=vals[0];else if(vals[vals.length-1]!==prev[prev.length-1])cand=vals[vals.length-1];if(cand!==null)emitBig(cand,source+':'+key,'array-change');}",
        @"function walk(o,source,depth){if(depth>6||o===null||o===undefined)return;if(Array.isArray(o)){for(var i=0;i<Math.min(o.length,80);i++)walk(o[i],source,depth+1);return;}if(typeof o!=='object')return;Object.keys(o).forEach(function(k){var v=o[k];var lk=k.toLowerCase();if(lk==='stopcoefficients'&&Array.isArray(v)){handleArray(k,v,source);return;}if(/^(stopcoefficient|finalmultiplier|crashpoint|resultcoefficient|resultmultiplier|finalcoefficient)$/i.test(k)){var n=num(v);var old=scalarState[k];scalarState[k]=n;if(old!==undefined&&n!==null&&n!==old)emitBig(n,source+':'+k,'scalar-change');return;}walk(v,source,depth+1);});}",
        @"function inspect(data,source){try{if(typeof data==='string'){var t=data.trim();if(!t)return;try{walk(JSON.parse(t),source,0);}catch(e){var re=/(?:stopCoefficient|finalMultiplier|crashPoint|resultCoefficient|resultMultiplier)[^0-9]{0,20}(\\d{1,3}(?:[\\.,]\\d{1,3})?)/ig,m;while((m=re.exec(t)))emitBig(m[1],source,'raw-key');}}else if(typeof data==='object')walk(data,source,0);}catch(e){}}",
        @"var nativeFetch=window.fetch;if(nativeFetch){window.fetch=function(input,init){var u=(typeof input==='string')?input:(input&&input.url)||'';var p=nativeFetch.apply(this,arguments);try{p.then(function(r){try{r.clone().text().then(function(t){inspect(t,'fetch:'+u);});}catch(e){}});}catch(e){}return p;};}",
        @"var xo=XMLHttpRequest.prototype.open;var xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__lj10url=u;return xo.apply(this,arguments);};XMLHttpRequest.prototype.send=function(){this.addEventListener('load',function(){try{inspect(this.responseText,'xhr:'+(this.__lj10url||''));}catch(e){}});return xs.apply(this,arguments);};",
        @"try{var NativeWS=window.WebSocket;if(NativeWS){function APWS(){var args=[null].concat(Array.prototype.slice.call(arguments));var C=Function.prototype.bind.apply(NativeWS,args);var ws=new C();var u=arguments[0]||'';ws.addEventListener('message',function(ev){inspect(ev.data,'ws:'+u);});return ws;}APWS.prototype=NativeWS.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){try{APWS[k]=NativeWS[k];}catch(e){}});window.WebSocket=APWS;}}catch(e){post({type:'diag',message:'WebSocket hook error: '+e,url:location.href});}",
        @"post({type:'ready',url:location.href});",
        @"})();"
    ];
    return [parts componentsJoinedByString:@""];
}

- (void)loadLuckyJet {
    NSURL *url = [NSURL URLWithString:LJURLString];
    if (!url) return;
    self.statusLabel.text = @"Загрузка LuckyJet… После полной загрузки нажмите «НАЧАТЬ НОВЫЙ ЗАМЕР».";
    NSURLRequest *request = [NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:35];
    [self.webView loadRequest:request];
}

- (void)startNewSession {
    [self.events removeAllObjects];
    self.lastEventDate = nil;
    self.lastEventValue = 0;
    self.collecting = YES;
    self.acceptAfterDate = [NSDate dateWithTimeIntervalSinceNow:2.0];
    [self.startButton setTitle:@"СБОР ИДЁТ…" forState:UIControlStateNormal];
    self.startButton.enabled = NO;
    self.statusLabel.text = @"Считаю только НОВЫЕ коэффициенты ≥10.00x после этого момента. Старые значения на экране не учитываются.";
    [self saveFiles];
    [self.tableView reloadData];
    [self updateStats];
}

- (void)acceptBig:(double)value source:(NSString *)source context:(NSString *)context pageURL:(NSString *)pageURL {
    if (!self.collecting || self.events.count >= 10) return;
    NSDate *now = [NSDate date];
    if (self.acceptAfterDate && [now compare:self.acceptAfterDate] == NSOrderedAscending) return;

    if (self.lastEventDate) {
        NSTimeInterval since = [now timeIntervalSinceDate:self.lastEventDate];
        if (since < 3.0) return;
        if (fabs(value - self.lastEventValue) < 0.0001 && since < 20.0) return;
    }

    NSTimeInterval interval = self.lastEventDate ? [now timeIntervalSinceDate:self.lastEventDate] : 0;
    NSDictionary *event = @{
        @"index": @(self.events.count + 1),
        @"coefficient": @(value),
        @"timestamp": [self.isoFormatter stringFromDate:now],
        @"timeKyiv": [self.clockFormatter stringFromDate:now],
        @"intervalSeconds": @(interval),
        @"intervalMinutes": @(interval / 60.0),
        @"source": source ?: @"unknown",
        @"context": context ?: @"",
        @"pageURL": pageURL ?: self.webView.URL.absoluteString ?: @""
    };
    [self.events addObject:event];
    self.lastEventDate = now;
    self.lastEventValue = value;
    [self saveFiles];
    [self.tableView reloadData];
    [self updateStats];

    if (self.events.count >= 10) {
        self.collecting = NO;
        self.startButton.enabled = YES;
        [self.startButton setTitle:@"НАЧАТЬ НОВЫЙ ЗАМЕР" forState:UIControlStateNormal];
        self.statusLabel.text = @"Готово: собрано 10 новых коэффициентов 10x+. Результат сохранён в JSON/CSV.";
        UIAlertController *a = [UIAlertController alertControllerWithTitle:@"Готово" message:@"Собрано 10 новых коэффициентов ≥10x. Нажмите «Экспорт результата»." preferredStyle:UIAlertControllerStyleAlert];
        [a addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
        [self presentViewController:a animated:YES completion:nil];
    }
}

- (void)updateStats {
    double sum = 0;
    NSInteger intervals = 0;
    for (NSDictionary *e in self.events) {
        double m = [e[@"intervalMinutes"] doubleValue];
        if (m > 0) { sum += m; intervals++; }
    }
    NSString *avg = intervals ? [NSString stringWithFormat:@"%.2f мин", sum / intervals] : @"—";
    self.statsLabel.text = [NSString stringWithFormat:@"Новых 10x+: %lu / 10\nСредний интервал: %@", (unsigned long)self.events.count, avg];
}

- (NSURL *)documentsDirectory {
    return [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
}

- (NSURL *)jsonURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"luckyjet_10x_session.json"]; }
- (NSURL *)csvURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"luckyjet_10x_session.csv"]; }

- (void)saveFiles {
    NSMutableArray *intervals = [NSMutableArray array];
    for (NSDictionary *e in self.events) {
        if ([e[@"intervalSeconds"] doubleValue] > 0) [intervals addObject:e[@"intervalMinutes"] ?: @0];
    }
    double avg = 0;
    for (NSNumber *n in intervals) avg += n.doubleValue;
    if (intervals.count) avg /= intervals.count;

    NSDictionary *payload = @{
        @"format": @"LuckyJet10xCollector/1",
        @"rule": @"new completed coefficients >= 10.00x only",
        @"targetCount": @10,
        @"collectedCount": @(self.events.count),
        @"timezone": @"Europe/Kyiv",
        @"sourceURL": LJURLString,
        @"averageIntervalMinutes": @(avg),
        @"events": self.events
    };
    NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[self jsonURL] atomically:YES];

    NSMutableString *csv = [NSMutableString stringWithString:@"index,coefficient,timeKyiv,timestamp,intervalSeconds,intervalMinutes,source,pageURL\n"];
    for (NSDictionary *e in self.events) {
        NSString *line = [NSString stringWithFormat:@"%@,%.3f,%@,%@,%.3f,%.3f,\"%@\",\"%@\"\n",
                          e[@"index"], [e[@"coefficient"] doubleValue], e[@"timeKyiv"], e[@"timestamp"],
                          [e[@"intervalSeconds"] doubleValue], [e[@"intervalMinutes"] doubleValue],
                          [[e[@"source"] description] stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""],
                          [[e[@"pageURL"] description] stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""]];
        [csv appendString:line];
    }
    [csv writeToURL:[self csvURL] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

- (void)exportSession {
    [self saveFiles];
    UIActivityViewController *vc = [[UIActivityViewController alloc] initWithActivityItems:@[[self jsonURL], [self csvURL]] applicationActivities:nil];
    if (vc.popoverPresentationController) vc.popoverPresentationController.sourceView = self.view;
    [self presentViewController:vc animated:YES completion:nil];
}

#pragma mark - WKScriptMessageHandler

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"lj10"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *d = message.body;
    NSString *type = [d[@"type"] description] ?: @"";
    if ([type isEqualToString:@"big"]) {
        double v = [d[@"value"] doubleValue];
        [self acceptBig:v source:[d[@"source"] description] context:[d[@"context"] description] pageURL:[d[@"url"] description]];
    }
}

#pragma mark - Web navigation

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSString *u = webView.URL.absoluteString ?: @"";
    if (!self.collecting) self.statusLabel.text = [NSString stringWithFormat:@"LuckyJet открыт: %@\nКогда игра работает — нажмите «НАЧАТЬ НОВЫЙ ЗАМЕР».", u.length ? u : @"—"];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    self.statusLabel.text = [NSString stringWithFormat:@"Ошибка загрузки: %@", error.localizedDescription ?: @"неизвестно"];
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (navigationAction.request.URL) [webView loadRequest:navigationAction.request];
    return nil;
}

#pragma mark - Table

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.events.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"event"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"event"];
    NSDictionary *e = self.events[indexPath.row];
    double interval = [e[@"intervalMinutes"] doubleValue];
    NSString *intervalText = indexPath.row == 0 ? @"первый 10x+" : [NSString stringWithFormat:@"через %.2f мин", interval];
    cell.textLabel.text = [NSString stringWithFormat:@"#%@  %.2fx  — %@", e[@"index"], [e[@"coefficient"] doubleValue], e[@"timeKyiv"]];
    cell.detailTextLabel.text = [NSString stringWithFormat:@"%@ • %@", intervalText, e[@"source"] ?: @""];
    return cell;
}

@end

@interface LJAppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation LJAppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    LJCollectorViewController *vc = [LJCollectorViewController new];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:vc];
    self.window.rootViewController = nav;
    [self.window makeKeyAndVisible];
    return YES;
}
@end

int main(int argc, char * argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([LJAppDelegate class]));
    }
}
