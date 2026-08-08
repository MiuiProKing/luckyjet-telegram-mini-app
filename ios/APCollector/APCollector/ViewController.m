#import "ViewController.h"
#import "ScreenCaptureManager.h"
#import "CaptureStore.h"
#import <WebKit/WebKit.h>

#pragma mark - URL trace browser

@interface APBrowserController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UITextFieldDelegate>
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UITextField *addressField;
@property (nonatomic, strong) UILabel *statusLabel;
@end

@implementation APBrowserController

- (void)logKind:(NSString *)kind value:(NSString *)value context:(NSString *)context {
    if (value.length == 0) return;
    [[CaptureStore shared] addKind:kind value:value context:context ?: @""];
}

- (NSString *)traceScript {
    return @"(function(){"
           "if(window.__apCollectorInstalled)return;window.__apCollectorInstalled=true;"
           "function send(t,u,c){try{window.webkit.messageHandlers.aplog.postMessage({type:t,url:String(u||''),context:String(c||'')});}catch(e){}}"
           "send('document',location.href,document.title);"
           "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(a&&a.href)send('click',a.href,(a.innerText||a.textContent||'').trim().slice(0,200));},true);"
           "var of=window.fetch;if(of){window.fetch=function(input,init){var u=(typeof input==='string')?input:(input&&input.url)||'';send('fetch',u,(init&&init.method)||'GET');return of.apply(this,arguments);};}"
           "var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){send('xhr',u,m||'GET');return xo.apply(this,arguments);};"
           "var oo=window.open;window.open=function(u){send('window_open',u,'');return oo.apply(this,arguments);};"
           "var hp=history.pushState;history.pushState=function(s,t,u){if(u)send('pushState',new URL(u,location.href).href,'');var r=hp.apply(this,arguments);send('location',location.href,'pushState');return r;};"
           "var hr=history.replaceState;history.replaceState=function(s,t,u){if(u)send('replaceState',new URL(u,location.href).href,'');var r=hr.apply(this,arguments);send('location',location.href,'replaceState');return r;};"
           "window.addEventListener('hashchange',function(){send('hashchange',location.href,'');});"
           "window.addEventListener('popstate',function(){send('popstate',location.href,'');});"
           "})();";
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"AllPredictor URL Trace";
    self.view.backgroundColor = UIColor.systemBackgroundColor;

    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    WKUserContentController *uc = [WKUserContentController new];
    [uc addScriptMessageHandler:self name:@"aplog"];
    WKUserScript *script = [[WKUserScript alloc] initWithSource:[self traceScript]
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

    self.addressField = [UITextField new];
    self.addressField.translatesAutoresizingMaskIntoConstraints = NO;
    self.addressField.borderStyle = UITextBorderStyleRoundedRect;
    self.addressField.autocapitalizationType = UITextAutocapitalizationTypeNone;
    self.addressField.autocorrectionType = UITextAutocorrectionTypeNo;
    self.addressField.keyboardType = UIKeyboardTypeURL;
    self.addressField.returnKeyType = UIReturnKeyGo;
    self.addressField.clearButtonMode = UITextFieldViewModeWhileEditing;
    self.addressField.delegate = self;
    self.addressField.text = @"https://allpredictor.com/";

    UIButton *go = [UIButton buttonWithType:UIButtonTypeSystem];
    go.translatesAutoresizingMaskIntoConstraints = NO;
    go.configuration = [UIButtonConfiguration filledButtonConfiguration];
    [go setTitle:@"Открыть" forState:UIControlStateNormal];
    [go addTarget:self action:@selector(goTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *back = [UIButton buttonWithType:UIButtonTypeSystem];
    back.translatesAutoresizingMaskIntoConstraints = NO;
    [back setTitle:@"←" forState:UIControlStateNormal];
    back.titleLabel.font = [UIFont systemFontOfSize:24 weight:UIFontWeightBold];
    [back addTarget:self action:@selector(backTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *forward = [UIButton buttonWithType:UIButtonTypeSystem];
    forward.translatesAutoresizingMaskIntoConstraints = NO;
    [forward setTitle:@"→" forState:UIControlStateNormal];
    forward.titleLabel.font = [UIFont systemFontOfSize:24 weight:UIFontWeightBold];
    [forward addTarget:self action:@selector(forwardTapped) forControlEvents:UIControlEventTouchUpInside];

    self.statusLabel = [UILabel new];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.statusLabel.numberOfLines = 2;
    self.statusLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightSemibold];
    self.statusLabel.textColor = UIColor.secondaryLabelColor;
    self.statusLabel.text = @"Логируются переходы, redirects, клики, fetch/XHR и window.open.";

    UIStackView *nav = [[UIStackView alloc] initWithArrangedSubviews:@[back, forward, self.addressField, go]];
    nav.translatesAutoresizingMaskIntoConstraints = NO;
    nav.axis = UILayoutConstraintAxisHorizontal;
    nav.spacing = 6;
    nav.alignment = UIStackViewAlignmentFill;
    [back.widthAnchor constraintEqualToConstant:36].active = YES;
    [forward.widthAnchor constraintEqualToConstant:36].active = YES;
    [go.widthAnchor constraintEqualToConstant:76].active = YES;

    [self.view addSubview:nav];
    [self.view addSubview:self.statusLabel];
    [self.view addSubview:self.webView];

    UILayoutGuide *g = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [nav.topAnchor constraintEqualToAnchor:g.topAnchor constant:6],
        [nav.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:8],
        [nav.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-8],
        [self.statusLabel.topAnchor constraintEqualToAnchor:nav.bottomAnchor constant:4],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:10],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-10],
        [self.webView.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:4],
        [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor]
    ]];

    [self loadAddress:@"https://allpredictor.com/"];
}

- (void)dealloc {
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"aplog"];
}

- (void)loadAddress:(NSString *)raw {
    NSString *s = [raw stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (s.length == 0) return;
    if (![s.lowercaseString hasPrefix:@"http://"] && ![s.lowercaseString hasPrefix:@"https://"]) {
        s = [@"https://" stringByAppendingString:s];
    }
    NSURL *url = [NSURL URLWithString:s];
    if (!url) return;
    self.addressField.text = url.absoluteString;
    [self logKind:@"nav_start" value:url.absoluteString context:@"manual/open"];
    [self.webView loadRequest:[NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:30]];
}

- (void)goTapped { [self.addressField resignFirstResponder]; [self loadAddress:self.addressField.text]; }
- (void)backTapped { if (self.webView.canGoBack) [self.webView goBack]; }
- (void)forwardTapped { if (self.webView.canGoForward) [self.webView goForward]; }
- (BOOL)textFieldShouldReturn:(UITextField *)textField { [self goTapped]; return YES; }

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"aplog"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *d = message.body;
    NSString *type = [d[@"type"] description] ?: @"js";
    NSString *url = [d[@"url"] description] ?: @"";
    NSString *ctx = [d[@"context"] description] ?: @"";
    if (url.length) [self logKind:[@"web_" stringByAppendingString:type] value:url context:ctx];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *method = navigationAction.request.HTTPMethod ?: @"GET";
    NSString *ctx = [NSString stringWithFormat:@"%@ | main=%@ | type=%ld", method, navigationAction.targetFrame.isMainFrame ? @"yes" : @"no", (long)navigationAction.navigationType];
    if (url.absoluteString.length) [self logKind:@"navigation_action" value:url.absoluteString context:ctx];
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    NSURLResponse *response = navigationResponse.response;
    NSString *url = response.URL.absoluteString ?: @"";
    NSInteger status = 0;
    if ([response isKindOfClass:NSHTTPURLResponse.class]) status = ((NSHTTPURLResponse *)response).statusCode;
    if (url.length) [self logKind:@"navigation_response" value:url context:[NSString stringWithFormat:@"HTTP %ld | main=%@", (long)status, navigationResponse.forMainFrame ? @"yes" : @"no"]];
    decisionHandler(WKNavigationResponsePolicyAllow);
}

- (void)webView:(WKWebView *)webView didStartProvisionalNavigation:(WKNavigation *)navigation {
    NSString *u = webView.URL.absoluteString ?: @"";
    if (u.length) [self logKind:@"did_start" value:u context:@""];
}

- (void)webView:(WKWebView *)webView didReceiveServerRedirectForProvisionalNavigation:(WKNavigation *)navigation {
    NSString *u = webView.URL.absoluteString ?: @"";
    if (u.length) [self logKind:@"server_redirect" value:u context:@""];
}

- (void)webView:(WKWebView *)webView didCommitNavigation:(WKNavigation *)navigation {
    NSString *u = webView.URL.absoluteString ?: @"";
    self.addressField.text = u;
    if (u.length) [self logKind:@"did_commit" value:u context:webView.title ?: @""];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSString *u = webView.URL.absoluteString ?: @"";
    self.addressField.text = u;
    self.statusLabel.text = [NSString stringWithFormat:@"Сейчас: %@\nВсе переходы пишутся в JSON/CSV.", u.length ? u : @"—"];
    if (u.length) [self logKind:@"did_finish" value:u context:webView.title ?: @""];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSString *u = error.userInfo[NSURLErrorFailingURLStringErrorKey] ?: webView.URL.absoluteString ?: @"";
    [self logKind:@"navigation_error" value:u context:error.localizedDescription ?: @""];
    self.statusLabel.text = [NSString stringWithFormat:@"Ошибка: %@", error.localizedDescription ?: @"неизвестно"];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSString *u = webView.URL.absoluteString ?: @"";
    [self logKind:@"navigation_error" value:u context:error.localizedDescription ?: @""];
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    NSURL *url = navigationAction.request.URL;
    if (url.absoluteString.length) {
        [self logKind:@"new_window" value:url.absoluteString context:@"opened in same trace webview"];
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

@end

#pragma mark - Main collector

@interface ViewController () <UITableViewDataSource>
@property (nonatomic) UILabel *statusLabel;
@property (nonatomic) UILabel *countLabel;
@property (nonatomic) UITableView *tableView;
@property (nonatomic) NSArray<NSDictionary *> *entries;
@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"AP Collector 1.3";
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.navigationController.navigationBar.prefersLargeTitles = YES;

    UILabel *intro = [UILabel new];
    intro.translatesAutoresizingMaskIntoConstraints = NO;
    intro.numberOfLines = 0;
    intro.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
    intro.text = @"Для полного списка URL используйте «Открыть AllPredictor + LOG». Пройдите путь от главной страницы до Lucky Jet/Rocket Queen и окна подписки. Collector сохранит переходы, redirects, клики, fetch/XHR и новые окна в JSON/CSV. Захват экрана оставлен как дополнительный режим.";

    self.statusLabel = [UILabel new];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.font = [UIFont systemFontOfSize:14 weight:UIFontWeightSemibold];
    self.statusLabel.textColor = UIColor.secondaryLabelColor;

    UIButton *browser = [UIButton buttonWithType:UIButtonTypeSystem];
    browser.translatesAutoresizingMaskIntoConstraints = NO;
    browser.configuration = [UIButtonConfiguration filledButtonConfiguration];
    [browser setTitle:@"Открыть AllPredictor + LOG URL" forState:UIControlStateNormal];
    [browser addTarget:self action:@selector(browserTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *start = [UIButton buttonWithType:UIButtonTypeSystem];
    start.translatesAutoresizingMaskIntoConstraints = NO;
    start.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [start setTitle:@"Начать захват экрана" forState:UIControlStateNormal];
    [start addTarget:self action:@selector(startTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *stop = [UIButton buttonWithType:UIButtonTypeSystem];
    stop.translatesAutoresizingMaskIntoConstraints = NO;
    stop.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [stop setTitle:@"Остановить захват" forState:UIControlStateNormal];
    [stop addTarget:self action:@selector(stopTapped) forControlEvents:UIControlEventTouchUpInside];

    UIButton *exportJSON = [UIButton buttonWithType:UIButtonTypeSystem];
    exportJSON.translatesAutoresizingMaskIntoConstraints = NO;
    exportJSON.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [exportJSON setTitle:@"Экспорт JSON" forState:UIControlStateNormal];
    [exportJSON addTarget:self action:@selector(exportJSON) forControlEvents:UIControlEventTouchUpInside];

    UIButton *exportCSV = [UIButton buttonWithType:UIButtonTypeSystem];
    exportCSV.translatesAutoresizingMaskIntoConstraints = NO;
    exportCSV.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [exportCSV setTitle:@"Экспорт CSV" forState:UIControlStateNormal];
    [exportCSV addTarget:self action:@selector(exportCSV) forControlEvents:UIControlEventTouchUpInside];

    UIButton *clear = [UIButton buttonWithType:UIButtonTypeSystem];
    clear.translatesAutoresizingMaskIntoConstraints = NO;
    [clear setTitle:@"Очистить данные" forState:UIControlStateNormal];
    [clear addTarget:self action:@selector(clearTapped) forControlEvents:UIControlEventTouchUpInside];

    UIStackView *buttons = [[UIStackView alloc] initWithArrangedSubviews:@[browser, start, stop, exportJSON, exportCSV, clear]];
    buttons.axis = UILayoutConstraintAxisVertical;
    buttons.spacing = 8;
    buttons.translatesAutoresizingMaskIntoConstraints = NO;

    self.countLabel = [UILabel new];
    self.countLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.countLabel.font = [UIFont monospacedDigitSystemFontOfSize:14 weight:UIFontWeightSemibold];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.translatesAutoresizingMaskIntoConstraints = NO;
    self.tableView.dataSource = self;

    [self.view addSubview:intro];
    [self.view addSubview:self.statusLabel];
    [self.view addSubview:buttons];
    [self.view addSubview:self.countLabel];
    [self.view addSubview:self.tableView];

    UILayoutGuide *g = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [intro.topAnchor constraintEqualToAnchor:g.topAnchor constant:10],
        [intro.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:16],
        [intro.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-16],
        [self.statusLabel.topAnchor constraintEqualToAnchor:intro.bottomAnchor constant:8],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:intro.trailingAnchor],
        [buttons.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:10],
        [buttons.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [buttons.trailingAnchor constraintEqualToAnchor:intro.trailingAnchor],
        [self.countLabel.topAnchor constraintEqualToAnchor:buttons.bottomAnchor constant:8],
        [self.countLabel.leadingAnchor constraintEqualToAnchor:intro.leadingAnchor],
        [self.tableView.topAnchor constraintEqualToAnchor:self.countLabel.bottomAnchor constant:4],
        [self.tableView.leadingAnchor constraintEqualToAnchor:g.leadingAnchor],
        [self.tableView.trailingAnchor constraintEqualToAnchor:g.trailingAnchor],
        [self.tableView.bottomAnchor constraintEqualToAnchor:g.bottomAnchor]
    ]];

    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadData) name:APCaptureStoreDidChangeNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadStatus) name:APCaptureStatusNotification object:nil];
    [self reloadData];
    [self reloadStatus];
}

- (void)dealloc { [[NSNotificationCenter defaultCenter] removeObserver:self]; }

- (void)browserTapped {
    APBrowserController *vc = [APBrowserController new];
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)reloadData {
    self.entries = [[CaptureStore shared] entries];
    self.countLabel.text = [NSString stringWithFormat:@"Собрано записей: %lu", (unsigned long)self.entries.count];
    [self.tableView reloadData];
}

- (void)reloadStatus { self.statusLabel.text = [ScreenCaptureManager shared].statusText; }
- (void)startTapped { [[ScreenCaptureManager shared] presentSystemPicker]; }
- (void)stopTapped { [[ScreenCaptureManager shared] stopCapture]; }

- (void)exportURL:(NSURL *)url {
    if (![[NSFileManager defaultManager] fileExistsAtPath:url.path]) return;
    UIActivityViewController *vc = [[UIActivityViewController alloc] initWithActivityItems:@[url] applicationActivities:nil];
    if (vc.popoverPresentationController) vc.popoverPresentationController.sourceView = self.view;
    [self presentViewController:vc animated:YES completion:nil];
}

- (void)exportJSON { [self exportURL:[[CaptureStore shared] jsonURL]]; }
- (void)exportCSV { [self exportURL:[[CaptureStore shared] csvURL]]; }

- (void)clearTapped {
    UIAlertController *a = [UIAlertController alertControllerWithTitle:@"Очистить данные?" message:@"JSON и CSV будут очищены. Папки с кадрами в Files останутся." preferredStyle:UIAlertControllerStyleAlert];
    [a addAction:[UIAlertAction actionWithTitle:@"Отмена" style:UIAlertActionStyleCancel handler:nil]];
    [a addAction:[UIAlertAction actionWithTitle:@"Очистить" style:UIAlertActionStyleDestructive handler:^(UIAlertAction * _Nonnull action) { [[CaptureStore shared] clear]; }]];
    [self presentViewController:a animated:YES completion:nil];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return MIN(self.entries.count, 150); }

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"c"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"c"];
    NSUInteger idx = self.entries.count - 1 - indexPath.row;
    NSDictionary *e = self.entries[idx];
    cell.textLabel.text = [NSString stringWithFormat:@"%@  %@", e[@"kind"] ?: @"", e[@"value"] ?: @""];
    cell.textLabel.numberOfLines = 2;
    cell.detailTextLabel.text = e[@"timestamp"] ?: @"";
    return cell;
}

@end
